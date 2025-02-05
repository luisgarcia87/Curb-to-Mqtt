# **Curb-to-Mqtt**

## Overview
The Curb-to-Mqtt project enables real-time monitoring of energy consumption through Curb's API, integrating this data with MQTT for efficient communication with smart home systems. This solution pulls live data from Curb's WebSocket, transforms it, and publishes it to an MQTT broker, allowing users to receive energy consumption information from their circuits in real time.

## Features
- OAuth 2.0 Authentication: The script automatically authenticates with the Curb API to obtain a user-specific access token.
- Location Fetching: Fetches the user's location ID dynamically using the authentication token, ensuring that the data corresponds to the correct location.
- MQTT Integration: Publishes energy consumption data to a configurable MQTT broker. Supports both authenticated and non-authenticated MQTT brokers.
- Dynamic Configuration: Configuration values such as API credentials, MQTT settings, and more can be stored in a configurable YAML file with support for comments.

## Requirements
- Node.js (version 16 or later recommended)
- MQTT Broker (can be local or cloud-based)
- Curb Account (with valid API credentials)

## Installation

**Clone the repository:**
```
git clone https://github.com/luisgarcia87/Curb-to-Mqtt.git
cd Curb-to-Mqtt
```

**Install dependencies:**
```
npm install
```
**Create your configuration file:** Create a config.yaml file in the root directory of the project, and specify your Curb API credentials and MQTT settings.

Example **config.yaml**:

```
TOKEN_URL: "https://energycurb.auth0.com/oauth/token"
CLIENT_ID: "iKAoRkr3qyFSnJSr3bodZRZZ6Hm3GqC3" 
CLIENT_SECRET: "dSoqbfwujF72a1DhwmjnqP4VAiBTqFt3WLLUtnpGDmCf6_CMQms3WEy8DxCQR3KY"
USERNAME: "YOUR-CURB-USERNAME" # Curb's login username/email information #
PASSWORD: "YOUR-CURB-PASSWORD" # Curb's password information #
AUDIENCE: "app.energycurb.com/api" 
MQTT_BROKER_URL: "mqtt://YOUR-MQTT-BROKER:1883" # MQTT Broker URL, default port 1883 #
MQTT_TOPIC: "home/curb/power" # You can change the topic to what ever you like it to be #
MQTT_USERNAME: "YOUR-MQTT-USERNAME"  # Leave empty if no username is needed
MQTT_PASSWORD: "YOUR-MQTT-PASSWORD"  # Leave empty if no password is needed
```
Change **USERNAME, PASSWORD, MQTT_BROKER_URL, MQTT_USERNAME, MQTT_PASSWORD** with your own information, you may leave **MQTT_TOPIC** as is or change it to your topic of preference.

Run the script:

```
node curb-mqtt.js
```
This will initiate the connection, authenticate, fetch your location ID, and start subscribing to the Curb WebSocket for real-time data and forward it via MQTT.


## How It Works
1. Authentication with Curb API
The script first fetches an authentication token from the Curb API using your CLIENT_ID, CLIENT_SECRET, USERNAME, and PASSWORD. This token is used to authenticate further API requests.

2. Fetching Location ID
Once authenticated, the script makes a GET request to Curb's /locations endpoint, passing the token in the request header. The location ID of your account's first location is retrieved and used to subscribe to your circuits' data.

3. Connecting to WebSocket
With the token and location ID in hand, the script connects to Curb's WebSocket API (/api/circuit-data). It subscribes to real-time data for the specified location and waits for updates on circuit consumption.

4. MQTT Integration
The data received from the Curb WebSocket (such as circuit power consumption) is then formatted and published to the configured MQTT broker under the topic home/curb/power/{circuit-id}.

5. Token Refresh
To ensure continuous operation, the script automatically refreshes the authentication token every 12 hours to avoid expiration, and re-authenticates with the WebSocket if necessary.

## Usage
### Once the script is running, it will:

- Continuously fetch real-time power consumption data from your Curb devices.
- Publish this data to the configured MQTT broker under the topics specified in the MQTT_TOPIC.
- Automatically refresh the authentication token every 12 hours.
- You can monitor your energy consumption on any MQTT-compatible platform, such as Home Assistant, Node-RED, or other smart home applications.

## Error Handling
### The script includes error handling for:

- Failed authentication with the Curb API.
- Issues fetching location data.
- Connection issues with the MQTT broker.
- WebSocket disconnections, which are automatically reconnected after a brief delay.

I am in no way an expert in this subject so feel free to comment and propose a better or improved code. I also need help if possible to make a custom HACS component out of this to be able to configure everything from Home Assistant UI.
