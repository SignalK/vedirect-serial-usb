[![Build Status](https://travis-ci.org/SignalK/vedirect-serial-usb.svg?branch=master)](https://travis-ci.org/SignalK/vedirect-serial-usb) [![Greenkeeper badge](https://badges.greenkeeper.io/SignalK/vedirect-serial-usb.svg)](https://greenkeeper.io/)

# vedirect-serial-usb

This code is a [Signal K Node Server](https://github.com/SignalK/signalk-server-node) plugin. It reads and parses Victron VE.Direct data.

The common way to connect to a Victron product is with the Victron [VE.Direct to USB interface](https://www.victronenergy.com/accessories/ve-direct-to-usb-interface) cable.
Alternatively, this plugin also supports receiving the data via UDP and on a TCP socket.

Compatible Victron products:

- BMV-700 series of Battery Monitors
- SmartShunt series of Battery Monitors
- SmartSolar Chargers
- BlueSolar Chargers
- Phoenix Inverters, including the Smarts, having a VE.Direct comms port

Note that above list may not be complete. 

The TCP and UDP connection methods are to allow connecting to a Victron product
too far away to run a serial cable. Ie. using a bridge to LAN/Wi-Fi that takes
the serial data and makes it available on a TCP socker or sends it out as UDP
packets. There are many of such devices available, as well as example DIY projects.
A good example on how to make it yourself is explained here:
https://pysselilivet.blogspot.com/2021/02/victron-vedirect-with-raspberry.html.

Lastly, note that when having a Victron GX Device, you won't be needing this
plugin. Details for that [here](https://github.com/sbender9/signalk-venus-plugin).

### Installation

Use the Signal K app store or install via NPM in the Signal K server root directory: `npm install @signalk/vedirect-serial-usb`


### Usage

Set up the appropiate device on the settings page of this plugin in the Signal K server admin UI, for instance to `/dev/ttyUSB0` and enable the plugin. Your VE.Direct data will be available in Signal K format via various clients and apps.

### Connections

- USB: Enter device path e.g `/dev/ttyUSB0`
- UDP: Enter `port` to listen, e.g. default `7878`. To use UDP, leave USB entry empty
- TCP: Enter `host` and `port` to connect. To use TCP, leave both USB and UDP entries empty

Ignore checksum option: If you need to ignore checksum, use this option 

### License

```
Copyright 2018 Joachim Bakke <github@heiamoss.com> & Fabian Tollenaar <fabian@decipher.industries>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
