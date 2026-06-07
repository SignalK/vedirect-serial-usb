/**
 * Standalone library wrapper.
 *
 * Shims the signalk-server host so the plugin can be consumed as a plain
 * Node.js library (see the README "Usage as a library" section). The plugin's
 * `app.handleMessage` deltas are re-emitted as `delta` events on this
 * EventEmitter; functionality is otherwise identical to running inside
 * signalk-server.
 */
import { EventEmitter } from 'events'
import createPlugin = require('./index')
import type {
  Plugin,
  PluginOptions,
  SignalKApp,
  SKDelta,
  VEDirectConfig
} from './types'

class VEDirect extends EventEmitter {
  private readonly _debug: boolean
  private readonly app: SignalKApp & { options: VEDirectConfig }
  private readonly plugin: Plugin

  constructor(config: VEDirectConfig = {}, _debug = false) {
    super()

    this._debug = _debug

    const options: VEDirectConfig = {
      device: 'Serial',
      connection: '/dev/ttyUSB0',
      port: 7878,
      ignoreChecksum: true,
      mainBatt: 'House',
      auxBatt: 'Starter',
      bmv: 'bmv',
      solar: 'Main',
      ...config
    }

    this.app = {
      handleMessage: (kind: string, data: SKDelta) => {
        if (kind === 'pluginId') {
          this.emit('delta', data)
          return
        }
        this.emit(kind, data)
      },
      debug: (msg: string) => this.debug(msg),
      options
    }

    this.plugin = createPlugin(this.app)
    this.start()
  }

  start(): void {
    if (typeof this.plugin.start !== 'function') {
      this.debug("Plugin not initialised, can't start")
      return
    }

    this.plugin.start(this.app.options as PluginOptions)
  }

  stop(): void {
    if (typeof this.plugin.stop !== 'function') {
      this.debug("Plugin not initialised, can't stop")
      return
    }

    this.plugin.stop()
  }

  debug(...args: unknown[]): void {
    if (this._debug) {
      console.log(...args)
    }
  }
}

export = VEDirect
