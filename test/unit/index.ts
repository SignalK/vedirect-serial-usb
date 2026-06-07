/**
 * Unit tests for the Signal K plugin entry point (src/index.ts).
 *
 * The three transports are replaced (via the require cache) with spies, so the
 * factory's wiring is observed without opening any port: which transport each
 * configured device starts, that parsed deltas reach the host under the plugin
 * id, that the legacy flat config is translated, and that stop() tears
 * each connection down.
 */
import { expect } from 'chai'
import { requireFresh } from '../helpers/moduleStub'
import type {
  Plugin,
  PluginOptions,
  PutHandler,
  PutResult,
  SignalKApp,
  SKDelta,
  VEDirectConnection
} from '../../src/types'
import type { VEDirectParser as ParserClass } from '../../src/Parser'

type PluginFactory = (app: SignalKApp) => Plugin

/** Spy transports recording how they were called and capturing the parser
 *  array so a test can drive a real delta through it. */
function makeStubs(): {
  serial: Record<string, unknown>
  udp: Record<string, unknown>
  tcp: Record<string, unknown>
  calls: {
    serialOpen: Array<{ device: string; items: number }>
    serialWrite: Array<{ message: string; items: number }>
    udpListen: Array<{ port: number; items: number }>
    tcpConnect: Array<{ host: string; port: number; items: number }>
    serialClose: number[]
    udpClose: number[]
    tcpClose: number[]
  }
  // Controls what the serial.write spy returns, so a test can simulate a port
  // that is open (true) or not open (false).
  control: { writeReturns: boolean }
  captured: () => { parser: ParserClass[]; index: number } | null
} {
  const calls = {
    serialOpen: [] as Array<{ device: string; items: number }>,
    serialWrite: [] as Array<{ message: string; items: number }>,
    udpListen: [] as Array<{ port: number; items: number }>,
    tcpConnect: [] as Array<{ host: string; port: number; items: number }>,
    serialClose: [] as number[],
    udpClose: [] as number[],
    tcpClose: [] as number[]
  }
  const control = { writeReturns: true }
  let captured: { parser: ParserClass[]; index: number } | null = null
  const grab = (parser: ParserClass[], index: number): void => {
    captured = { parser, index }
  }

  return {
    calls,
    control,
    captured: () => captured,
    serial: {
      open: (
        device: string,
        parser: ParserClass[],
        _d: unknown,
        items: number
      ) => {
        calls.serialOpen.push({ device, items })
        grab(parser, items)
      },
      close: (_d: unknown, items: number) => calls.serialClose.push(items),
      write: (message: string, items: number) => {
        calls.serialWrite.push({ message, items })
        return control.writeReturns
      }
    },
    udp: {
      listen: (
        port: number,
        parser: ParserClass[],
        _d: unknown,
        items: number
      ) => {
        calls.udpListen.push({ port, items })
        grab(parser, items)
      },
      close: (_d: unknown, items: number) => calls.udpClose.push(items)
    },
    tcp: {
      connect: (
        host: string,
        port: number,
        parser: ParserClass[],
        _d: unknown,
        items: number
      ) => {
        calls.tcpConnect.push({ host, port, items })
        grab(parser, items)
      },
      close: (_d: unknown, items: number) => calls.tcpClose.push(items)
    }
  }
}

/** A captured PUT registration plus the unregister callback handed back to the
 *  plugin, so tests can both invoke the handler and assert teardown. */
interface PutRegistration {
  context: string
  path: string
  handler: PutHandler
  unregister: () => void
  unregistered: boolean
}

function makeApp(): {
  app: SignalKApp
  messages: Array<{ id: string; delta: SKDelta }>
  debugLogs: string[]
  puts: PutRegistration[]
} {
  const messages: Array<{ id: string; delta: SKDelta }> = []
  const debugLogs: string[] = []
  const puts: PutRegistration[] = []
  return {
    app: {
      handleMessage: (id: string, delta: SKDelta) =>
        messages.push({ id, delta }),
      debug: (msg: string) => debugLogs.push(msg),
      registerPutHandler: (
        context: string,
        path: string,
        handler: PutHandler
      ) => {
        const registration: PutRegistration = {
          context,
          path,
          handler,
          unregister: () => {
            registration.unregistered = true
          },
          unregistered: false
        }
        puts.push(registration)
        return registration.unregister
      }
    },
    messages,
    debugLogs,
    puts
  }
}

function loadPlugin(): {
  plugin: Plugin
  stubs: ReturnType<typeof makeStubs>
  messages: Array<{ id: string; delta: SKDelta }>
  debugLogs: string[]
  puts: PutRegistration[]
} {
  const stubs = makeStubs()
  const createPlugin = requireFresh<PluginFactory>('src/index', {
    'src/serial': stubs.serial,
    'src/udp': stubs.udp,
    'src/tcp': stubs.tcp
  })
  const { app, messages, debugLogs, puts } = makeApp()
  return { plugin: createPlugin(app), stubs, messages, debugLogs, puts }
}

function conn(over: Partial<VEDirectConnection>): VEDirectConnection {
  return {
    device: 'UDP',
    connection: 'localhost',
    port: 7878,
    ignoreChecksum: true,
    mainBatt: 'House',
    auxBatt: 'Starter',
    bmv: 'bmv',
    solar: 'Main',
    ...over
  }
}

describe('plugin factory', () => {
  it('exposes its identity and a connections schema', () => {
    const { plugin } = loadPlugin()
    expect(plugin.id).to.equal('vedirect-signalk')
    expect(plugin.name).to.equal('VE.Direct to Signal K')
    const schema = plugin.schema as {
      properties: {
        vedirect: {
          type: string
          items: { properties: { deviceType: { enum: string[] } } }
        }
      }
    }
    expect(schema.properties.vedirect.type).to.equal('array')
    expect(
      schema.properties.vedirect.items.properties.deviceType.enum
    ).to.deep.equal(['Battery monitor', 'Solar charger'])
  })

  it('starts the matching transport for each configured device', () => {
    const { plugin, stubs } = loadPlugin()
    const options: PluginOptions = {
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0' }),
        conn({ device: 'UDP', port: 7878 }),
        conn({ device: 'TCP', connection: '10.0.0.5', port: 2000 })
      ]
    }
    plugin.start(options)

    expect(stubs.calls.serialOpen).to.deep.equal([
      { device: '/dev/ttyUSB0', items: 0 }
    ])
    expect(stubs.calls.udpListen).to.deep.equal([{ port: 7878, items: 1 }])
    expect(stubs.calls.tcpConnect).to.deep.equal([
      { host: '10.0.0.5', port: 2000, items: 2 }
    ])
  })

  it('forwards a parsed delta to the host under the plugin id', () => {
    const { plugin, stubs, messages } = loadPlugin()
    plugin.start({ vedirect: [conn({ device: 'UDP' })] })

    const grabbed = stubs.captured()
    expect(grabbed, 'transport received the parser array').to.not.equal(null)
    const parser = grabbed!.parser[grabbed!.index] as unknown as ParserClass
    parser.addChunk(Buffer.from('\nV\t12340\nChecksum\t1'), grabbed!.index)

    expect(messages).to.have.lengthOf(1)
    expect(messages[0]!.id).to.equal('vedirect-signalk')
    expect(messages[0]!.delta.context).to.equal('vessels.self')
  })

  it('translates a legacy serial config', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({ device: '/dev/ttyUSB0' })
    expect(stubs.calls.serialOpen).to.deep.equal([
      { device: '/dev/ttyUSB0', items: 0 }
    ])
  })

  it('translates a legacy udp config', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({ udpPort: 7878 })
    expect(stubs.calls.udpListen).to.deep.equal([{ port: 7878, items: 0 }])
  })

  it('translates a legacy tcp config', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({ host: '1.2.3.4', tcpPort: 5555 })
    expect(stubs.calls.tcpConnect).to.deep.equal([
      { host: '1.2.3.4', port: 5555, items: 0 }
    ])
  })

  it('defaults the tcp port to 0 when the legacy config omits it', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({ host: '1.2.3.4' })
    expect(stubs.calls.tcpConnect).to.deep.equal([
      { host: '1.2.3.4', port: 0, items: 0 }
    ])
  })

  it('starts nothing for an empty legacy config', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({})
    expect(stubs.calls.serialOpen).to.have.lengthOf(0)
    expect(stubs.calls.udpListen).to.have.lengthOf(0)
    expect(stubs.calls.tcpConnect).to.have.lengthOf(0)
  })

  it('stop() closes every started transport', () => {
    const { plugin, stubs } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0' }),
        conn({ device: 'UDP', port: 7878 }),
        conn({ device: 'TCP', connection: '10.0.0.5', port: 2000 })
      ]
    })
    plugin.stop()

    expect(stubs.calls.serialClose).to.deep.equal([0])
    expect(stubs.calls.udpClose).to.deep.equal([1])
    expect(stubs.calls.tcpClose).to.deep.equal([2])
  })

  it('stop() before start() is a no-op', () => {
    const { plugin, stubs } = loadPlugin()
    expect(() => plugin.stop()).to.not.throw()
    expect(stubs.calls.serialClose).to.have.lengthOf(0)
  })
})

describe('relay PUT handler', () => {
  // Starts a single serial connection and returns the captured registration so
  // the handler can be invoked directly. bmv defaults to 'bmv' (see conn()), so
  // the relay path is anchored unless a test overrides it.
  function startSerial(over: Partial<VEDirectConnection> = {}): {
    stubs: ReturnType<typeof makeStubs>
    debugLogs: string[]
    reg: PutRegistration
  } {
    const { plugin, stubs, debugLogs, puts } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0', ...over })
      ]
    })
    expect(puts, 'a relay handler was registered').to.have.lengthOf(1)
    return { stubs, debugLogs, reg: puts[0]! }
  }

  it('registers a writable relay on the bmv path for a serial connection', () => {
    const { reg } = startSerial({ bmv: 'house' })
    expect(reg.context).to.equal('vessels.self')
    expect(reg.path).to.equal('electrical.batteries.house.relay')
  })

  it('registers no relay handler for UDP or TCP connections', () => {
    const { plugin, puts } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'UDP', port: 7878 }),
        conn({ device: 'TCP', connection: '10.0.0.5', port: 2000 })
      ]
    })
    expect(puts).to.have.lengthOf(0)
  })

  it('registers no relay handler, and logs, when the bmv name is blank', () => {
    const { plugin, puts, debugLogs } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0', bmv: '' })
      ]
    })
    expect(puts).to.have.lengthOf(0)
    expect(debugLogs.some((m) => m.includes('relay control disabled'))).to.be
      .true
  })

  it('registers no relay handler when the bmv name is absent', () => {
    // A config persisted before the bmv field existed deserializes without it.
    const { plugin, puts } = loadPlugin()
    const c = conn({ device: 'Serial', connection: '/dev/ttyUSB0' })
    delete (c as { bmv?: string }).bmv
    plugin.start({ vedirect: [c] })
    expect(puts).to.have.lengthOf(0)
  })

  it('registers no relay handler, and logs, for a solar charger', () => {
    // The relay lives on the BMV-7xx; a solar charger has no such relay, so even
    // with a BMV name set it must not expose a writable path that would write
    // register 0x034E to an MPPT.
    const { plugin, puts, debugLogs } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({
          device: 'Serial',
          connection: '/dev/ttyUSB0',
          deviceType: 'Solar charger',
          bmv: 'house'
        })
      ]
    })
    expect(puts).to.have.lengthOf(0)
    expect(debugLogs.some((m) => m.includes('solar charger'))).to.be.true
  })

  it('registers a relay handler for an explicit battery monitor', () => {
    const { reg } = startSerial({ deviceType: 'Battery monitor', bmv: 'house' })
    expect(reg.path).to.equal('electrical.batteries.house.relay')
  })

  it('registers only one relay handler when two serial connections share a bmv name', () => {
    // Both serial connections resolve to electrical.batteries.bmv.relay; the host
    // would keep a single handler, so a PUT could drive the wrong port. The second
    // registration is refused and logged rather than silently shadowing the first.
    const { plugin, puts, debugLogs } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0', bmv: 'bmv' }),
        conn({ device: 'Serial', connection: '/dev/ttyUSB1', bmv: 'bmv' })
      ]
    })
    expect(puts).to.have.lengthOf(1)
    expect(puts[0]!.path).to.equal('electrical.batteries.bmv.relay')
    expect(debugLogs.some((m) => m.includes('already registered'))).to.be.true
  })

  it('frees the relay path on stop() so a restart can re-register it', () => {
    const { plugin, puts } = loadPlugin()
    const options = {
      vedirect: [
        conn({ device: 'Serial', connection: '/dev/ttyUSB0', bmv: 'bmv' })
      ]
    }
    plugin.start(options)
    plugin.stop()
    plugin.start(options)
    // Two registrations across the restart: the second start is not mistaken for
    // a duplicate, proving stop() released the claimed path.
    expect(puts).to.have.lengthOf(2)
    expect(puts[1]!.path).to.equal('electrical.batteries.bmv.relay')
  })

  it('writes the relay-on command and reports success for value 1', () => {
    const { stubs, debugLogs, reg } = startSerial()
    const result = reg.handler(
      'vessels.self',
      reg.path,
      1,
      () => {}
    ) as PutResult
    expect(stubs.calls.serialWrite).to.deep.equal([
      { message: ':84E030001FB\n', items: 0 }
    ])
    expect(result.state).to.equal('COMPLETED')
    expect(result.statusCode).to.equal(200)
    // The reply and the log say "sent", not "switched": the BMV does not ack.
    expect(result.message).to.contain('sent')
    expect(debugLogs.some((m) => m.includes('on command sent'))).to.be.true
  })

  it('accepts boolean true as relay-on', () => {
    const { stubs, reg } = startSerial()
    reg.handler('vessels.self', reg.path, true, () => {})
    expect(stubs.calls.serialWrite[0]!.message).to.equal(':84E030001FB\n')
  })

  it('writes the relay-off command and reports success for value 0', () => {
    const { stubs, reg } = startSerial()
    const result = reg.handler(
      'vessels.self',
      reg.path,
      0,
      () => {}
    ) as PutResult
    expect(stubs.calls.serialWrite).to.deep.equal([
      { message: ':84E030000FC\n', items: 0 }
    ])
    expect(result.state).to.equal('COMPLETED')
    expect(result.statusCode).to.equal(200)
    expect(result.message).to.contain('sent')
  })

  it('accepts boolean false as relay-off', () => {
    const { stubs, reg } = startSerial()
    reg.handler('vessels.self', reg.path, false, () => {})
    expect(stubs.calls.serialWrite[0]!.message).to.equal(':84E030000FC\n')
  })

  it('rejects out-of-range, non-numeric and nullish values with 400, logs, and does not write', () => {
    const { stubs, debugLogs, reg } = startSerial()
    // Only 1/0/true/false are valid; everything else (negative, other numbers,
    // numeric strings, null/undefined/NaN, objects) must be refused untouched.
    const invalid: unknown[] = [-1, 2, '0', '1', null, undefined, NaN, {}]
    for (const value of invalid) {
      const result = reg.handler(
        'vessels.self',
        reg.path,
        value,
        () => {}
      ) as PutResult
      const label = `value ${JSON.stringify(value)}`
      expect(result.state, label).to.equal('COMPLETED')
      expect(result.statusCode, label).to.equal(400)
      expect(result.message, label).to.contain('Invalid relay value')
      // The offending path is echoed back so the caller sees which path failed.
      expect(result.message, label).to.contain(reg.path)
    }
    expect(stubs.calls.serialWrite).to.have.lengthOf(0)
    // Every rejection is logged, so a caller repeatedly sending bad values is
    // diagnosable from the plugin log rather than silently ignored.
    expect(debugLogs.filter((m) => m.includes('rejected'))).to.have.lengthOf(
      invalid.length
    )
  })

  it('reports failure when the serial port is not open', () => {
    const { stubs, debugLogs, reg } = startSerial()
    stubs.control.writeReturns = false // simulate a closed/absent port
    const result = reg.handler(
      'vessels.self',
      reg.path,
      1,
      () => {}
    ) as PutResult
    expect(stubs.calls.serialWrite, 'write was attempted').to.have.lengthOf(1)
    expect(result.state).to.equal('COMPLETED')
    expect(result.statusCode).to.equal(503)
    expect(result.message).to.contain('not open')
    expect(debugLogs.some((m) => m.includes('not open'))).to.be.true
  })

  it('registers the relay handler for a legacy serial config', () => {
    const { plugin, puts } = loadPlugin()
    plugin.start({ device: '/dev/ttyUSB0' })
    expect(puts).to.have.lengthOf(1)
    expect(puts[0]!.path).to.equal('electrical.batteries.bmv.relay')
  })

  it('unregisters the relay handler on stop()', () => {
    const { plugin, puts } = loadPlugin()
    plugin.start({
      vedirect: [conn({ device: 'Serial', connection: '/dev/ttyUSB0' })]
    })
    expect(puts[0]!.unregistered).to.be.false
    plugin.stop()
    expect(puts[0]!.unregistered).to.be.true
  })

  // Pins the per-connection index wiring: with the only serial+bmv connection at
  // a non-zero index, the write must target that index (not a hardcoded 0) and
  // stop() must unregister exactly that connection, leaving the non-serial slot
  // (which registered nothing) untouched.
  it('routes the write to the registering connection index and tears down only that one', () => {
    const { plugin, stubs, puts } = loadPlugin()
    plugin.start({
      vedirect: [
        conn({ device: 'UDP', port: 7878 }),
        conn({ device: 'Serial', connection: '/dev/ttyUSB1', bmv: 'house' })
      ]
    })

    expect(puts, 'only the serial connection registers').to.have.lengthOf(1)
    expect(puts[0]!.path).to.equal('electrical.batteries.house.relay')

    puts[0]!.handler('vessels.self', puts[0]!.path, 1, () => {})
    expect(stubs.calls.serialWrite).to.deep.equal([
      { message: ':84E030001FB\n', items: 1 }
    ])

    plugin.stop()
    expect(puts[0]!.unregistered).to.be.true
  })
})
