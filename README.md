[![Build Status](https://travis-ci.org/SignalK/vedirect-serial-usb.svg?branch=master)](https://travis-ci.org/SignalK/vedirect-serial-usb) [![Greenkeeper badge](https://badges.greenkeeper.io/SignalK/vedirect-serial-usb.svg)](https://greenkeeper.io/)

# vedirect-serial-usb

> Signal K Node.js server plugin that reads and parses VE.direct data via multiple interfaces. E.g. serial [USB](https://www.victronenergy.com/accessories/ve-direct-to-usb-interface), UDP and TCP interfaces.


### Installation

Use the Signal K app store or install via NPM in the Signal K server root directory: `npm install @signalk/vedirect-serial-usb`


### Usage

Set up the appropiate device on the settings page of this plugin in the Signal K server admin UI, for instance to `/dev/ttyUSB0` and enable the plugin. Your VE.Direct data will be available in Signal K format via various clients and apps.

### Connections
**Select device**
- Serial, UDP or TCP

**Connection details**
- Serial: Enter device path e.g `/dev/ttyUSB0`
- UDP: *`ignored`*
- TCP: Enter host `IP address`

**Port**
- Serial: *`ignored`*
- UDP/TCP: `port`

**Ignore Checksum**
- If you want to ignore checksum, use this option. Default `ON`

**SK Paths**
- Give each device unique SK paths 

### License

```
Copyright 2018 Joachim Bakke <github@heiamoss.com>, Fabian Tollenaar <fabian@decipher.industries> and 
Karl-Erik Gustafsson <ke.gustafsson@gmail.com>

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
