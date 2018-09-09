[![Build Status](https://travis-ci.org/joabakk/vedirect-serial-usb.svg?branch=master)](https://travis-ci.org/joabakk/vedirect-serial-usb)

# vedirect-serial-usb

> Signal K Node.js server plugin that reads and parses VE.direct data via serial USB [interface](https://www.victronenergy.com/accessories/ve-direct-to-usb-interface).


### Installation

Use the Signal K app store or install via NPM in the Signal K server root directory: `npm install @signalk/vedirect-serial-usb`


### Usage

Set up the appropiate device on the settings page of this plugin in the Signal K server admin UI, for instance to `/dev/ttyUSB0` and enable the plugin. Your VE.Direct data will be available in Signal K format via various clients and apps.
