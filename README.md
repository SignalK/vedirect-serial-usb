# vedirect-serial-usb

[![CI](https://github.com/SignalK/vedirect-serial-usb/actions/workflows/ci.yml/badge.svg)](https://github.com/SignalK/vedirect-serial-usb/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@signalk/vedirect-serial-usb.svg)](https://www.npmjs.com/package/@signalk/vedirect-serial-usb)
[![License](https://img.shields.io/npm/l/@signalk/vedirect-serial-usb.svg)](https://github.com/SignalK/vedirect-serial-usb/blob/master/LICENSE)

This code is a [Signal K Node Server](https://github.com/SignalK/signalk-server-node) plugin. It reads and parses Victron VE.Direct data.

The common way to connect to a Victron product is with the Victron [VE.Direct to USB interface](https://www.victronenergy.com/accessories/ve-direct-to-usb-interface) cable.
Alternatively, this plugin also supports receiving the data via UDP and on a TCP socket.

Compatible Victron products:

- BMV-700 series of Battery Monitors (reported to work also on the BMV-600)
- SmartShunt series of Battery Monitors
- SmartSolar Chargers
- BlueSolar Chargers
- Phoenix Inverters, including the Smarts, having a VE.Direct comms port

Note that above list may not be complete.

The TCP and UDP connection methods are to allow connecting to a Victron product
too far away to run a serial cable. Ie. using a bridge to LAN/Wi-Fi that takes
the serial data and makes it available on a TCP socket or sends it out as UDP
packets. There are many of such devices available, as well as example DIY projects.
A good example on how to make it yourself is explained here:
https://pysselilivet.blogspot.com/2021/02/victron-vedirect-with-raspberry.html.

Lastly, note that when having a Victron GX Device, you won't be needing this
plugin. Details for that [here](https://github.com/sbender9/signalk-venus-plugin).

## Installation

Use the Signal K app store or install via NPM in the Signal K server root directory: `npm install @signalk/vedirect-serial-usb`

## Usage

Set up the appropriate device on the settings page of this plugin in the Signal K server admin UI, for instance to `/dev/ttyUSB0` and enable the plugin. Your VE.Direct data will be available in Signal K format via various clients and apps.

## Connections

**Select device**

- Serial, UDP or TCP

**Connection details**

- Serial: Enter device path e.g `/dev/ttyUSB0`
- UDP: _`ignored`_
- TCP: Enter host `IP address`

**Port**

- Serial: _`ignored`_
- UDP/TCP: `port`

**Ignore Checksum**

- If you want to ignore checksum, use this option. Default `ON`

**SK Paths**

- Give each device unique SK paths

## BMV relay control

For BMV-7xx battery monitors on a **serial** connection, the built-in relay is
exposed as a writable Signal K path so other plugins can switch it:

```
electrical.batteries.<bmv>.relay
```

where `<bmv>` is the BMV name configured for the connection. Send a PUT request
with a value of `1`/`true` to close the relay or `0`/`false` to open it. The
plugin reports an error if the value is out of range or the serial port is not
open, rather than silently doing nothing.

The writable path exists only for a serial connection whose **device type is a
battery monitor** (not a solar charger) and that has a **BMV name** configured;
without a name there is nothing to anchor the path to, so no writable path is
registered. A successful response means the command was written to the port, not
that the relay is confirmed switched: the BMV sends no acknowledgement, and it
acts on the command only when its relay is set to **remote control** on the BMV
itself. Relay control is only available over serial, as it depends on writing
back to the VE.Direct port.

## Usage as a library

It's possible to use this plugin as a library, in other Node.js code. This feature simply wraps the plugin in an easy-to-consume manner, so functionality is identical. Example:

```javascript
const VEDirect = require('@signalk/vedirect-serial-usb/standalone')
const consumer = new VEDirect({
  device: '/dev/ttyUSB0',
  ignoreChecksum: true,
  mainBatt: 'House',
  auxBatt: 'Starter',
  solar: 'Main'
})

consumer.on('delta', (delta) => console.log('[onDelta]', delta))
consumer.stop() // stop the plugin, destruct the connections
consumer.start() // (re-)start the plugin
```

## License

Apache-2.0. See [LICENSE](LICENSE).

Copyright 2018 Joachim Bakke, Fabian Tollenaar and Karl-Erik Gustafsson.
