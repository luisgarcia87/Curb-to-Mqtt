# **Curb-to-Mqtt**

## Overview
Curb Energy is a company that provides real-time energy monitoring solutions. Their flagship product, the Curb energy monitor, is a hardware device that connects to an electrical panel to track electricity usage at the circuit level.

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
Run this command inside the folder where the script is located.
```
npm install
```
If you encounter errors you might need to run the command as:
```
sudo npm install
```
**Edit the configuration file:** Edit the config.yaml file in the root directory of the project, and specify your Curb API credentials and MQTT settings.

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

Run the following command in the folder where the script is locataed:
```
node curb-to-mqtt.js
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

## Running as a service ##

### Step 1: Ensure Your Script is in a Suitable Location
First, ensure that the curb-to-mqtt.js script (or whatever you named it) is located in a directory where you want to run it. For this example, the script is located in

> /home/pi/projects/Curb-to-Mqtt/curb-to-mqtt.js 

## Step 2: Create the Systemd Service File
You need to create a systemd service file that will manage the script. To do this:
Open the systemd service file in an editor.
```
sudo nano /etc/systemd/system/curb-to-mqtt.service
```
Add the following configuration to the file, based on your working example. Ensure that you modify it to fit your specific file paths and settings and user and group ownership.
```
[Unit]
Description=Curb API Token & MQTT Forwarder
After=network.target

[Service]
ExecStart=/usr/bin/node /home/pi/projects/curb-to-mqtt/curb-to-mqtt.js
Restart=always
User=pi
Group=pi
Environment=NODE_ENV=production
WorkingDirectory=/home/pi/projects/curb-to-mqtt
StandardOutput=append:/var/log/curb.log
StandardError=append:/var/log/curb.log

[Install]
WantedBy=multi-user.target
```
## Step 3: Set Permissions for the Service File
Ensure that the service file has the correct permissions so that systemd can access it:
```
sudo chmod 644 /etc/systemd/system/curb-to-mqtt.service
```

## Step 4: Reload Systemd and Enable the Service
eload the systemd daemon to recognize the new service, and enable it to start at boot:
```
sudo systemctl daemon-reload
sudo systemctl enable curb-to-mqtt.service
```

## Step 5: Start the Service
Now, start the service to run the script:
```
sudo systemctl start curb-to-mqtt.service
```

## Step 6: Verify the Service is Running
```
sudo systemctl status curb-to-mqtt.service
```
## Troubleshooting

If the service does not run, you might need to modify permission on the script folder location:

_Set the correct ownership (change 'pi' to the user you are using for the service)_
```
sudo chown -R pi:pi /home/pi/projects/Curb-to-Mqtt
```
_Set the correct permissions for the folder and script_
```
sudo chmod -R 755 /home/pi/projects/Curb-to-Mqtt
```

If you want to view the logs for troubleshooting, you can use:
```
tail -f /var/log/curb.log
```

## Adding MQTT Sensor to Home Assistant

To monitor the power consumption of your Curb circuits in Home Assistant, you need to create MQTT sensors that subscribe to the topics published by the `Curb-to-Mqtt` script. The script will publish data to MQTT topics in the following format:

> home/curb/power/{circuid-id}

Each topic corresponds to a specific circuit and contains the power consumption data (in watts) and other attributes in the message payload.

### Example Configuration for Home Assistant

Below is an example configuration for an MQTT sensor in Home Assistant to monitor the power consumption of a circuit:
```
mqtt:
  sensor:
    - name: "Kitchen Dishwasher Power"
      state_topic: "home/curb/power/{circuit-id}"
      value_template: "{{ value_json.power }}"
      unit_of_measurement: "W"
      device_class: power
      json_attributes_topic: "home/curb/power/{circuit-id}"
      json_attributes_template: "{{ value_json | tojson }}"
```
## Explanation of Configuration
- name: The name of the sensor as it will appear in Home Assistant. In this case, it is "Kitchen Dishwasher Power".
- state_topic: The MQTT topic to subscribe to for receiving power consumption data. - The {circuit-id} in the topic corresponds to the unique ID of the circuit.
- value_template: A Jinja template to extract the power value from the received JSON payload. This value represents the power consumption of the circuit in watts.
- unit_of_measurement: The unit for the sensor value. In this case, it's "W" for watts.
- device_class: Defines the type of sensor. Setting this to power ensures the correct display of power-related data in Home Assistant.
- json_attributes_topic: The topic that contains additional attributes for the sensor, such as the circuit ID, label, and other relevant data.
- json_attributes_template: A Jinja template that converts the entire JSON payload into attributes in Home Assistant. The tojson filter converts the payload into a JSON string.

## Multiple MQTT Sensors ###
If you have multiple circuits, you can create additional sensors by replicating the configuration with different state_topic values for each unique circuit ID. For example:
```
mqtt:
  sensor:
    - name: "Kitchen Dishwasher Power"
      state_topic: "home/curb/power/{circuit-id-1}"
      value_template: "{{ value_json.power }}"
      unit_of_measurement: "W"
      device_class: power
      json_attributes_topic: "home/curb/power/{circuit-id-1}"
      json_attributes_template: "{{ value_json | tojson }}"

    - name: "Water Pump & Deck Power"
      state_topic: "home/curb/power/{circuit-id-2}"
      value_template: "{{ value_json.power }}"
      unit_of_measurement: "W"
      device_class: power
      json_attributes_topic: "home/curb/power/{circuit-id-2}"
      json_attributes_template: "{{ value_json | tojson }}"
```

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
