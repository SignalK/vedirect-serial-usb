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
  constructor (config = {}, _debug = false) {
    super()

    this._debug = _debug
    this.app = {
      handleMessage: (kind, data) => {
        if (kind === 'pluginId') {
          this.emit('delta', data)
          return
        }
        this.emit(kind, data)
      },
      debug: (args) => this.debug(args),
      options: {
        device: 'Serial',
        connection: '/dev/ttyUSB0',
        port: 7878,
        ignoreChecksum: true,
        mainBatt: 'House',
        auxBatt: 'Starter',
        bmv: 'bmv',
        solar: 'Main',
        ...(config || {}),
      }
    }

    this.plugin = SKPlugin(this.app)
    this.start()
  }

  start () {
    if (!this.plugin || !this.plugin.hasOwnProperty('start')) {
      this.debug(`Plugin not initialised, can't start`)
      return
    }

    this.plugin.start(this.app.options)
  }

  stop () {
    if (!this.plugin || !this.plugin.hasOwnProperty('stop')) {
      this.debug(`Plugin not initialised, can't stop`)
      return
    }

    this.plugin.stop()
  }

  debug (...args) {
    if (this._debug) {
      console.log.apply(console, args)
    }
  }
}

module.exports = VEDirect
