const axios = require('axios');
const fs = require('fs');
const mqtt = require('mqtt');
const yaml = require('js-yaml');

const config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));

const {
    POLL_URL,           // "http://192.168.1.236/"
    POLL_INTERVAL_MS,   // e.g. 10000
    MQTT_BROKER_URL,
    MQTT_TOPIC,         // e.g. "curb/power"
    MQTT_USERNAME,
    MQTT_PASSWORD,
    DEVICE_ID,          // e.g. "curb_cmwg37ps"
    DEVICE_NAME,        // e.g. "Curb Energy Monitor"
    CIRCUIT_NAMES,      // optional array of 18 names, e.g. ["Main 1", "Kitchen", ...]
    HA_DISCOVERY_PREFIX,// e.g. "homeassistant"
    DEBUG
} = config;

const DEVICE_ID_SAFE = (DEVICE_ID || 'curb').replace(/[^a-z0-9_]/gi, '_');

function debugLog(...args) {
    if (DEBUG) console.log('[DEBUG]', ...args);
}

// ---------------------------------------------------------------------------
// HTML parsing — split the entire page on <br> tags and keep only lines
// that contain the aggregated sample marker.
// ---------------------------------------------------------------------------
function extractLogLines(html) {
    return html
        .split(/<br\s*\/?>/i)
        .map(l => l.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim())
        .filter(l => l.includes('Load control got aggregated sample'));
}

const SAMPLE_RE = /INFO Load control got aggregated sample\s+(\{.+\})\s*$/;

function parseSampleLine(line) {
    const m = line.match(SAMPLE_RE);
    if (!m) return null;

    let obj;
    try { obj = JSON.parse(m[1]); } catch { return null; }

    const watts = [];
    for (const group of (obj.g || [])) {
        for (const circuit of (group.c || [])) {
            watts.push(circuit.w ?? 0);
        }
    }

    if (watts.length !== 18) {
        debugLog(`Unexpected circuit count: ${watts.length}`);
        return null;
    }

    // Wh over 1-minute interval → watts
    for (let i = 0; i < watts.length; i++) {
        watts[i] = Math.abs(watts[i]) * 60;
    }

    return { t: obj.t, watts };
}

// ---------------------------------------------------------------------------
// Home Assistant MQTT discovery
// ---------------------------------------------------------------------------
function circuitName(idx) {
    return (CIRCUIT_NAMES && CIRCUIT_NAMES[idx]) || `Circuit ${idx + 1}`;
}

function circuitObjectId(idx) {
    return `${DEVICE_ID_SAFE}_circuit_${idx + 1}`;
}

function stateTopic(idx) {
    return `${MQTT_TOPIC}/circuit_${idx + 1}`;
}

function publishDiscovery(mqttClient) {
    const prefix = HA_DISCOVERY_PREFIX || 'homeassistant';

    const device = {
        identifiers: [DEVICE_ID_SAFE],
        name: DEVICE_NAME || 'Curb Energy Monitor',
        model: 'Curb',
        manufacturer: 'Curb'
    };

    for (let i = 0; i < 18; i++) {
        const objId = circuitObjectId(i);
        const discoveryTopic = `${prefix}/sensor/${DEVICE_ID_SAFE}/${objId}/config`;

        const payload = {
            name: circuitName(i),
            unique_id: objId,
            default_entity_id: `sensor.${objId}`,
            state_topic: stateTopic(i),
            value_template: '{{ value_json.power | round(1) }}',
            unit_of_measurement: 'W',
            device_class: 'power',
            state_class: 'measurement',
            device
        };

        mqttClient.publish(discoveryTopic, JSON.stringify(payload), { retain: true });
        debugLog(`Discovery published: ${discoveryTopic}`);
    }
}

// ---------------------------------------------------------------------------
// Poll + publish
// ---------------------------------------------------------------------------
async function pollAndPublish(mqttClient, lastTimestampRef) {
    let html;
    try {
        const res = await axios.get(POLL_URL, { timeout: 15000 });
        html = res.data;
    } catch (err) {
        console.error('HTTP poll error:', err.message);
        return;
    }

    const lines = extractLogLines(html);
    if (!lines.length) {
        debugLog('Could not find Load controller log section.');
        return;
    }

    // Collect all valid samples, sort oldest-first, publish any newer than last seen.
    const samples = [];
    for (const line of lines) {
        const sample = parseSampleLine(line);
        if (sample) samples.push(sample);
    }

    if (!samples.length) {
        debugLog('No valid aggregated sample lines found.');
        return;
    }

    samples.sort((a, b) => a.t - b.t);

    const newSamples = samples.filter(s => lastTimestampRef.value === null || s.t > lastTimestampRef.value);
    if (!newSamples.length) {
        debugLog(`All ${samples.length} samples already published, skipping.`);
        return;
    }

    debugLog(`Publishing ${newSamples.length} new sample(s) out of ${samples.length} total.`);

    for (const sample of newSamples) {
        debugLog(`  t=${sample.t} (${new Date(sample.t * 1000).toISOString()})`);
        sample.watts.forEach((w, idx) => {
            const topic = stateTopic(idx);
            const payload = JSON.stringify({ circuit: idx + 1, power: w, t: sample.t });
            mqttClient.publish(topic, payload, { retain: true });
        });
        lastTimestampRef.value = sample.t;
    }

    debugLog(`Last published t=${lastTimestampRef.value}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
    const mqttOptions = {};
    if (MQTT_USERNAME) mqttOptions.username = MQTT_USERNAME;
    if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

    const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);
    mqttClient.on('connect', () => debugLog('Connected to MQTT broker.'));
    mqttClient.on('error', err => console.error('MQTT error:', err));

    const lastTimestampRef = { value: null };

    async function scheduleNextPoll() {
        const prevT = lastTimestampRef.value;
        await pollAndPublish(mqttClient, lastTimestampRef);
        const gotNewData = lastTimestampRef.value !== prevT;
        const delay = gotNewData ? 5 * 60000 : 60000;
        debugLog(`Next poll in ${delay / 1000}s (${gotNewData ? 'new data received' : 'no new data'})`);
        setTimeout(scheduleNextPoll, delay);
    }

    mqttClient.once('connect', () => {
        publishDiscovery(mqttClient);
        debugLog(`Polling ${POLL_URL} (58s after new data, 15s if none)`);
        scheduleNextPoll();
    });
}

main();
