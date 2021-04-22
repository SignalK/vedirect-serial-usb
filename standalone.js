/**
 * standalone.js
 * 
 * @description exports a class that shims the Signal K server, in order to make this plugin available as a library in other software
 * @module @signalk/vedirect-serial-usb
 * @author Fabian Tollenaar <fabian@essense.ai> (https://essense.ai)
 * @license Apache_2.0
 */

const EventEmitter = require('events')
const SKPlugin = require('./index')

class VEDirect extends EventEmitter {
  constructor (config = {}) {
    super()

    this.app = {
      handleMessage: (kind, data) => this.emit(kind, data),
      debug: true,
      options: {
        device: 'Serial',
        connection: '/dev/ttyUSB0',
        port: 7878,
        ignoreChecksum: true,
        mainBatt: 'House',
        auxBatt: 'Starter',
        solar: 'Main',
        ...(config || {}),
      }
    }

    this.plugin = SKPlugin(this.app)
    this.start()
  }

  start () {
    if (!this.plugin) {
      return
    }

    this.plugin.start(this.app.options)
  }

  stop () {
    if (!this.plugin) {
      return
    }

    this.plugin.stop()
  }
}

module.exports = VEDirect