
# **Curb-to-Mqtt**

## Overview
Curb Energy is a company that provides real-time energy monitoring solutions. Their flagship product, the Curb energy monitor, is a hardware device that connects to an electrical panel to track electricity usage at the circuit level.

As of February 24, 2026, Curb has discontinued their cloud support, rendering the existing devices nearly useless.
However the devices do expose log files locally, which can be accessed to extract the power usage data.

The Curb-to-Mqtt project enables monitoring of energy consumption, integrating this data with MQTT for efficient communication with smart home systems. This solution polls a local [Curb Energy Monitor](https://energycurb.com/) status page, parses the load controller log, and publishes per-circuit power readings to an MQTT broker using [Home Assistant MQTT discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery).

---

## How it works

The Curb device exposes a status page at `http://<device-ip>/`. This script:

1. Fetches the page every 5 minutes (1 minute if no new data was found).
2. Extracts all `Load control got aggregated sample` lines from the load controller log.
3. Parses the JSON payload in each line, converting the 18 per-circuit Wh/minute readings to watts (`Wh × 60 = W`).
4. Publishes any samples with a timestamp newer than the last published one, in chronological order.
5. On first connect, publishes Home Assistant MQTT discovery messages so the device and all 18 sensors appear automatically.

---

## Prerequisites

- [Node.js](https://nodejs.org/) v16 or newer
- An MQTT broker (e.g. [Mosquitto](https://mosquitto.org/)) accessible on your network
- Your Curb device reachable by IP on the local network

---

## Installation

```bash
git clone https://github.com/pvanbaren/Curb-to-Mqtt.git
cd curb-to-mqtt
npm install
```

### Dependencies

| Package | Purpose |
|---|---|
| `axios` | HTTP polling |
| `mqtt` | MQTT client |
| `js-yaml` | Config file parsing |

Install them if not already present:

```bash
npm install axios mqtt js-yaml
```

---

## Configuration

Copy or create `config.yaml` in the same directory as `curb-to-mqtt.js`:

```yaml
# URL of the Curb device status page
POLL_URL: "http://192.168.1.236/"

# MQTT broker connection
MQTT_BROKER_URL: "mqtt://192.168.1.10"
MQTT_USERNAME: ""
MQTT_PASSWORD: ""

# Base MQTT topic — each circuit publishes to MQTT_TOPIC/circuit_N
MQTT_TOPIC: "curb/power"

# Home Assistant MQTT discovery prefix (must match HA configuration)
HA_DISCOVERY_PREFIX: "homeassistant"

# Unique identifier for this device (no spaces; the serial number works well)
DEVICE_ID: "curb_cmwg37ps"

# Friendly name shown in Home Assistant
DEVICE_NAME: "Curb Energy Monitor"

# Optional: friendly names for each of the 18 circuits, in order.
# Any omitted entries default to "Circuit N".
CIRCUIT_NAMES:
  - "Main L1"
  - "Kitchen"
  - "Refrigerator"
  - "Dryer"
  - "Washer"
  - "HVAC"
  - "Main L2"
  - "Water Heater"
  - "Dishwasher"
  - "Microwave"
  - "Garage"
  - "Office"
  - "Master Bedroom"
  - "Living Room"
  - "Outdoor Lights"
  - "Circuit 16"
  - "Circuit 17"
  - "Circuit 18"

# Set to true to enable verbose logging
DEBUG: false
```

### Finding your circuit order

Enable `DEBUG: true` on the first run. The script logs each circuit value in order (`circuit_1` through `circuit_18`). Cross-reference these with known loads (e.g. turn a large appliance on/off) to identify each circuit and fill in `CIRCUIT_NAMES`.

---

## Running manually

```bash
node curb-to-mqtt.js
```

With debug output:

```bash
DEBUG=true node curb-to-mqtt.js
```

Or set `DEBUG: true` in `config.yaml`.

---

## Home Assistant integration

The script uses MQTT discovery, so no manual sensor configuration is required. Ensure the [MQTT integration](https://www.home-assistant.io/integrations/mqtt/) is enabled in Home Assistant with the same broker.

On first run, a device named **Curb Energy Monitor** (or your `DEVICE_NAME`) will appear under **Settings → Devices & Services → MQTT** with 18 power sensors. Each sensor has:

- **Unit:** W
- **Device class:** Power
- **State class:** Measurement (compatible with the Energy dashboard)

---

## Polling behaviour

| Condition | Next poll delay |
|---|---|
| New samples published | 5 minutes |
| No new data found | 1 minute |

The Curb status page updates approximately every 5–6 minutes and retains ~60–90 minutes of per-minute samples. On each successful poll the script publishes all samples newer than the last known timestamp, so no readings are skipped if a poll is delayed.

---

## MQTT topic structure

| Topic | Payload |
|---|---|
| `curb/power/circuit_N` | `{"circuit": N, "power": 1234.5, "t": 1772837437}` |

All messages are published with `retain: true`.

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
Add the following configuration to the file, based on your working example. Ensure that you modify it to fit your specific file paths, setting, user and group ownership.
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

Install and configure the "Mosquitto broker" app in Home Assistant.
The Curb energy monitor will then appear as a device, and the sensors as entities.

## Disclaimer
This project is not affiliated with or endorsed by Curb Energy.

If you found this helpful and want to show your appreciation, you can treat Daniel Garcia to a coffee or a beer! He has put a lot of time into the original script, and it will put a smile
on his face if someone says thanks.

<a href="https://www.buymeacoffee.com/luisgarciak" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
