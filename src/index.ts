/**
 * Signal K server plugin entry point.
 *
 * Reads VE.Direct data over Serial, UDP or TCP, parses it (src/Parser.ts) and
 * forwards the resulting Signal K deltas to the host. Supports several
 * connections at once (`options.vedirect[]`) and keeps an in-memory fallback
 * for the legacy single-connection config format.
 */
import * as serial from './serial'
import * as udp from './udp'
import * as tcp from './tcp'
import { VEDirectParser } from './Parser'
import type {
  Plugin,
  PluginOptions,
  SignalKApp,
  SKDelta,
  VEDirectConnection
} from './types'
import { PLUGIN_ID } from './constants'

const createPlugin = function (app: SignalKApp): Plugin {
  const parser: VEDirectParser[] = []
  let shaddow: PluginOptions | null = null

  function startConnection(
    conn: VEDirectConnection,
    connectionIndex: number
  ): void {
    const instance = new VEDirectParser(shaddow ?? undefined)
    parser[connectionIndex] = instance

    instance.on('delta', (delta: SKDelta) => {
      app.handleMessage(PLUGIN_ID, delta)
    })

    if (conn.device === 'Serial') {
      serial.open(conn.connection, parser, app.debug, connectionIndex)
    } else if (conn.device === 'UDP') {
      udp.listen(conn.port, parser, app.debug, connectionIndex)
    } else if (conn.device === 'TCP') {
      tcp.connect(
        conn.connection,
        conn.port,
        parser,
        app.debug,
        connectionIndex
      )
    }
  }

  // Builds the current multi-connection config from a legacy flat config so
  // that installations predating the `vedirect[]` rework keep working without
  // a persisted migration.
  function fromLegacy(options: PluginOptions): VEDirectConnection | null {
    const base = {
      ignoreChecksum: options.ignoreChecksum ?? true,
      mainBatt: options.mainBatt ?? 'House',
      auxBatt: options.auxBatt ?? 'Starter',
      bmv: options.bmv ?? 'bmv',
      solar: options.solar ?? 'Main',
      deviceType: options.deviceType
    }

    if (options.device) {
      return { device: 'Serial', connection: options.device, port: 0, ...base }
    }
    if (options.udpPort) {
      return {
        device: 'UDP',
        connection: 'localhost',
        port: options.udpPort,
        ...base
      }
    }
    if (options.host) {
      return {
        device: 'TCP',
        connection: options.host,
        port: options.tcpPort ?? 0,
        ...base
      }
    }
    return null
  }

  const plugin: Plugin = {
    id: PLUGIN_ID,
    name: 'VE.Direct to Signal K',
    description: 'VE.Direct to Signal K',

    start(options: PluginOptions): void {
      shaddow = options

      if (options.vedirect !== undefined) {
        options.vedirect.forEach((conn, connectionIndex) => {
          startConnection(conn, connectionIndex)
        })
        return
      }

      const legacy = fromLegacy(options)
      if (legacy !== null) {
        shaddow = { ...options, vedirect: [legacy] }
        startConnection(legacy, 0)
      }
    },

    stop(): void {
      if (!shaddow) {
        return
      }

      if (shaddow.vedirect !== undefined) {
        shaddow.vedirect.forEach((conn, connectionIndex) => {
          parser[connectionIndex]?.removeAllListeners()
          delete parser[connectionIndex]
          if (conn.device === 'Serial') {
            serial.close(app.debug, connectionIndex)
          } else if (conn.device === 'UDP') {
            udp.close(app.debug, connectionIndex)
          } else {
            tcp.close(app.debug, connectionIndex)
          }
        })
      }

      shaddow = null
    },

    schema: {
      type: 'object',
      properties: {
        vedirect: {
          type: 'array',
          title: 'Connections',
          description: 'Connections to VE.Direct devices',
          items: {
            type: 'object',
            required: [],
            properties: {
              device: {
                type: 'string',
                default: 'Serial',
                title: 'Select device',
                enum: ['Serial', 'UDP', 'TCP']
              },
              connection: {
                type: 'string',
                title: 'Connection details',
                description:
                  'Serial: e.g. /dev/ttyUSB0,  UDP: ignored  or  TCP: IP address',
                default: '/dev/ttyUSB0'
              },
              port: {
                type: 'number',
                title: 'Port',
                description: 'Serial: ignored, UDP/TCP: port',
                default: 7878
              },
              deviceType: {
                type: 'string',
                title: 'Device type',
                description:
                  'Battery monitor keeps V/I under electrical.batteries; Solar charger (MPPT) routes V/I under electrical.solar to avoid clashing with a battery monitor on the same bank',
                default: 'Battery monitor',
                enum: ['Battery monitor', 'Solar charger']
              },
              ignoreChecksum: {
                type: 'boolean',
                title: 'Ignore Checksum',
                default: true
              },
              mainBatt: {
                type: 'string',
                title: 'Main Battery name in SK path',
                default: 'House'
              },
              auxBatt: {
                type: 'string',
                title: 'Aux Battery name in SK path',
                default: 'Starter'
              },
              bmv: {
                type: 'string',
                title: 'BMV name in SK path',
                default: 'bmv'
              },
              solar: {
                type: 'string',
                title: 'Solar name in SK path',
                default: 'Main'
              }
            }
          }
        }
      }
    }
  }

  return plugin
}

// `export = createPlugin` emits `module.exports = createPlugin` so the
// signalk-server host, which does `require(pluginPath)(app)`, receives the
// factory directly. `export =` forbids named exports, which is fine: the
// package's single public entry is the factory.
export = createPlugin
