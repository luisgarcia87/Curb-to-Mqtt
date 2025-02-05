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
    MQTT_BROKER_URL, MQTT_TOPIC, MQTT_USERNAME, MQTT_PASSWORD 
} = config;

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

        const accessToken = response.data.access_token;
        console.log('Access token fetched successfully');
        return accessToken;
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
            const locationId = response.data[0].id; // Get the first location ID
            console.log('Location ID fetched successfully:', locationId);
            return locationId;
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

        const socket = io('https://app.energycurb.com/api/circuit-data', {
            transports: ['websocket'],
            query: { token: USER_ACCESS_TOKEN }
        });

        // MQTT connection options
        const mqttOptions = {};

        // Only include username if it's provided
        if (MQTT_USERNAME) {
            mqttOptions.username = MQTT_USERNAME;
        }

        // Only include password if it's provided
        if (MQTT_PASSWORD) {
            mqttOptions.password = MQTT_PASSWORD;
        }

        const mqttClient = mqtt.connect(MQTT_BROKER_URL, mqttOptions);

        mqttClient.on('connect', () => console.log('Connected to MQTT broker'));
        mqttClient.on('error', (err) => console.error('MQTT Error:', err));

        socket.on('connect', () => {
            console.log('Connected to Curb WebSocket');
            socket.emit('authenticate', { token: USER_ACCESS_TOKEN });
        });

        socket.on('authorized', () => {
            console.log('Authorized successfully');
            socket.emit('subscribe', LOCATION_ID); // Use the fetched location ID
        });

        socket.on('unauthorized', (err) => console.error('Authentication failed:', err));

        socket.on('disconnect', () => {
            console.warn('Disconnected from Curb WebSocket, attempting reconnect...');
            setTimeout(connectToLiveData, 5000);
        });

        socket.on('error', (error) => console.error('Socket error:', error));

        socket.on('data', (data) => {
            console.log('Received data:', data);
            data.circuits.forEach(circuit => {
                const payload = {
                    id: circuit.id,
                    label: circuit.label,
                    power: circuit.w,
                    type: circuit.circuit_type
                };
                const topic = `${MQTT_TOPIC}/${circuit.id}`;
                mqttClient.publish(topic, JSON.stringify(payload));
                console.log(`Published to ${topic}:`, payload);
            });
        });

        // Periodically refresh token every 12 hours
        setInterval(async () => {
            try {
                const newToken = await fetchUserAccessToken();
                if (newToken !== USER_ACCESS_TOKEN) {
                    console.log('Access token has changed, reconnecting...');
                    USER_ACCESS_TOKEN = newToken;
                    socket.emit('authenticate', { token: USER_ACCESS_TOKEN });
                }
            } catch (error) {
                console.error('Error refreshing token:', error.message);
            }
        }, 43200000); // 12 hours
    } catch (error) {
        console.error('Error during the setup:', error.message);
    }
}

// Start the connection process
connectToLiveData();