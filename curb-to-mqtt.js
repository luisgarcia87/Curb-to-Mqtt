const axios = require('axios');
const fs = require('fs');
const io = require('socket.io-client');
const mqtt = require('mqtt');
const yaml = require('js-yaml');

// Load configuration from config.yaml file
const config = yaml.load(fs.readFileSync('config.yaml', 'utf8'));

// Extracting values from the config object
const { 
    TOKEN_URL, CLIENT_ID, CLIENT_SECRET, USERNAME, PASSWORD, AUDIENCE, 
    MQTT_BROKER_URL, MQTT_TOPIC, MQTT_USERNAME, MQTT_PASSWORD, DEBUG 
} = config;

// Debug logging function
function debugLog(...args) {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
}

// Function to fetch a new access token
async function fetchUserAccessToken() {
    try {
        const response = await axios.post(TOKEN_URL, {
            grant_type: 'password',
            audience: AUDIENCE,
            username: USERNAME,
            password: PASSWORD,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        }, {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
        });

        debugLog('Access token fetched successfully.');
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching access token:', error.message);
        throw error;
    }
}

// Function to fetch the location ID
async function fetchLocationId(accessToken) {
    try {
        const response = await axios.get('https://app.energycurb.com/api/v3/locations', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.data && response.data.length > 0) {
            debugLog('Location ID fetched:', response.data[0].id);
            return response.data[0].id;
        } else {
            console.error('No locations found.');
            throw new Error('No locations found');
        }
    } catch (error) {
        console.error('Error fetching location ID:', error.message);
        throw error;
    }
}

// Function to connect to Curb WebSocket and MQTT
async function connectToLiveData() {
    try {
        let USER_ACCESS_TOKEN = await fetchUserAccessToken();
        let LOCATION_ID = await fetchLocationId(USER_ACCESS_TOKEN);

        debugLog('Connecting to WebSocket with location ID:', LOCATION_ID);

        const socket = io('https://app.energycurb.com/api/circuit-data', {
            transports: ['websocket'],
            query: { token: USER_ACCESS_TOKEN }
        });

        const mqttOptions = {};
        if (MQTT_USERNAME) mqttOptions.username = MQTT_USERNAME;
        if (MQTT_PASSWORD) mqttOptions.password = MQTT_PASSWORD;

        const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

        mqttClient.on('connect', () => debugLog('Connected to MQTT broker.'));
        mqttClient.on('error', (err) => console.error('MQTT Error:', err));

        socket.on('connect', () => {
            debugLog('Connected to Curb WebSocket.');
            socket.emit('authenticate', { token: USER_ACCESS_TOKEN });
        });

        socket.on('authorized', () => {
            debugLog('WebSocket authentication successful.');
            socket.emit('subscribe', LOCATION_ID);
        });

        socket.on('unauthorized', (err) => console.error('Authentication failed:', err));

        socket.on('disconnect', () => {
            debugLog('Disconnected from Curb WebSocket. Reconnecting in 5 seconds...');
            setTimeout(connectToLiveData, 5000);
        });

        socket.on('error', (error) => console.error('Socket error:', error));

        socket.on('data', (data) => {
            debugLog('Received data from WebSocket.');
            data.circuits.forEach(circuit => {
                const payload = {
                    id: circuit.id,
                    label: circuit.label,
                    power: circuit.w,
                    type: circuit.circuit_type
                };
                const topic = `${MQTT_TOPIC}/${circuit.id}`;
                mqttClient.publish(topic, JSON.stringify(payload));
                debugLog('Published to MQTT:', topic, payload);
            });
        });

        // Periodically refresh token every 12 hours
        setInterval(async () => {
            try {
                const newToken = await fetchUserAccessToken();
                if (newToken !== USER_ACCESS_TOKEN) {
                    USER_ACCESS_TOKEN = newToken;
                    socket.emit('authenticate', { token: USER_ACCESS_TOKEN });
                    debugLog('Access token refreshed and re-authenticated.');
                }
            } catch (error) {
                console.error('Error refreshing token:', error.message);
            }
        }, 43200000); // 12 hours
    } catch (error) {
        console.error('Error during setup:', error.message);
    }
}


// Start the connection process
connectToLiveData();

