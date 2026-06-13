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
  PutHandler,
  SignalKApp,
  SKDelta,
  VEDirectConnection
} from './types'
import { PLUGIN_ID } from './constants'

// VE.Direct HEX "Set" frames toggling the BMV-7xx built-in relay (register
// 0x034E), exposing it as a writable Signal K switch for other plugins.
//
//   :  8    4E03    00     VV   CC \n
//   |  Set  reg LE  flags  val  checksum
//
// CC is chosen so (0x08 + every payload byte) & 0xFF == 0x55 (VE.Direct HEX
// checksum): on -> val 0x01 -> :84E030001FB,  off -> val 0x00 -> :84E030000FC.
// The BMV only acts on these once its relay is set to remote control.
const RELAY_ON = ':84E030001FB\n'
const RELAY_OFF = ':84E030000FC\n'

// Maps a Signal K relay PUT value to its VE.Direct command. Accepts the numeric
// 1/0 the relay state is published as (see the RELAY field in src/fields.ts) and
// boolean true/false for convenience. Returns null for any out-of-range value so
// the handler can reject it.
function relayCommand(value: unknown): string | null {
  if (value === 1 || value === true) {
    return RELAY_ON
  }
  if (value === 0 || value === false) {
    return RELAY_OFF
  }
  return null
}

const createPlugin = function (app: SignalKApp): Plugin {
  const parser: VEDirectParser[] = []
  // Unregister callbacks for the relay PUT handlers, indexed by connection like
  // `parser`, so stop() can tear each one down.
  const putUnregister: Array<() => void> = []
  // Relay paths already claimed by a registered handler. Two serial connections
  // configured with the same BMV name resolve to the same path; the host keeps
  // only one handler, so a PUT could drive the wrong port. The duplicate is
  // refused instead. Cleared on stop().
  const registeredRelayPaths = new Set<string>()
  let shaddow: PluginOptions | null = null

  // Builds the PUT handler for one serial connection's BMV relay. It writes the
  // matching VE.Direct HEX command and reports failure (rather than a false 200)
  // when the value is out of range or the serial port is not open. A 200 means
  // the frame was written to the port, not that the relay switched: the BMV sends
  // no acknowledgement and acts only when its relay is in remote control, so the
  // reply says "sent", not "confirmed". Each outcome is logged so a command that
  // looks accepted but changes nothing is still diagnosable from the plugin log.
  function relayPutHandler(connectionIndex: number): PutHandler {
    return (_context, path, value) => {
      const command = relayCommand(value)
      if (command === null) {
        app.debug(
          `Relay PUT on ${path} rejected: ${JSON.stringify(value)} is not 0/1 or true/false`
        )
        return {
          state: 'COMPLETED',
          statusCode: 400,
          message: `Invalid relay value ${JSON.stringify(value)} for ${path}; expected 0/1 or true/false`
        }
      }

      const desired = command === RELAY_ON ? 'on' : 'off'

      if (!serial.write(command, connectionIndex)) {
        app.debug(
          `Relay PUT on ${path} ignored: serial connection ${connectionIndex} is not open`
        )
        return {
          state: 'COMPLETED',
          statusCode: 503,
          message: `Serial connection ${connectionIndex} is not open; relay unchanged`
        }
      }

      app.debug(
        `Relay PUT on ${path}: ${desired} command sent to serial connection ${connectionIndex} (the BMV applies it only when its relay is in remote control)`
      )
      return {
        state: 'COMPLETED',
        statusCode: 200,
        message: `Relay ${desired} command sent; takes effect only when the BMV relay is set to remote control`
      }
    }
  }

  // Exposes the BMV relay as a writable Signal K path for one serial connection,
  // anchored on the configured BMV name (matching the RELAY read field's path,
  // electrical.batteries.<bmv>). The relay belongs to the BMV-7xx, so it is
  // registered only for battery monitors (the default when deviceType is unset),
  // never for a solar charger, and only when a BMV name is configured to anchor
  // the path. The skipped cases are logged rather than silent: the RELAY field
  // still publishes the relay state, so a writable path that is quietly absent
  // would be a mystery to whoever tries to PUT to it.
  function registerRelayHandler(
    conn: VEDirectConnection,
    connectionIndex: number
  ): void {
    if (conn.deviceType === 'Solar charger') {
      app.debug(
        `Serial connection ${connectionIndex} is a solar charger, not a BMV; relay control disabled`
      )
      return
    }
    if (!conn.bmv) {
      app.debug(
        `Serial connection ${connectionIndex} has no BMV name; relay control disabled`
      )
      return
    }

    const path = `electrical.batteries.${conn.bmv}.relay`
    if (registeredRelayPaths.has(path)) {
      app.debug(
        `Relay path ${path} is already registered by another connection; relay control disabled for serial connection ${connectionIndex}`
      )
      return
    }

    registeredRelayPaths.add(path)
    putUnregister[connectionIndex] = app.registerPutHandler(
      'vessels.self',
      path,
      relayPutHandler(connectionIndex)
    )
  }

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
      registerRelayHandler(conn, connectionIndex)
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
          putUnregister[connectionIndex]?.()
          delete putUnregister[connectionIndex]
          if (conn.device === 'Serial') {
            serial.close(app.debug, connectionIndex)
          } else if (conn.device === 'UDP') {
            udp.close(app.debug, connectionIndex)
          } else {
            tcp.close(app.debug, connectionIndex)
          }
        })
        registeredRelayPaths.clear()
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
