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
    udpListen: Array<{ port: number; items: number }>
    tcpConnect: Array<{ host: string; port: number; items: number }>
    serialClose: number[]
    udpClose: number[]
    tcpClose: number[]
  }
  captured: () => { parser: ParserClass[]; index: number } | null
} {
  const calls = {
    serialOpen: [] as Array<{ device: string; items: number }>,
    udpListen: [] as Array<{ port: number; items: number }>,
    tcpConnect: [] as Array<{ host: string; port: number; items: number }>,
    serialClose: [] as number[],
    udpClose: [] as number[],
    tcpClose: [] as number[]
  }
  let captured: { parser: ParserClass[]; index: number } | null = null
  const grab = (parser: ParserClass[], index: number): void => {
    captured = { parser, index }
  }

  return {
    calls,
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
      close: (_d: unknown, items: number) => calls.serialClose.push(items)
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

function makeApp(): {
  app: SignalKApp
  messages: Array<{ id: string; delta: SKDelta }>
} {
  const messages: Array<{ id: string; delta: SKDelta }> = []
  return {
    app: {
      handleMessage: (id: string, delta: SKDelta) =>
        messages.push({ id, delta }),
      debug: () => {}
    },
    messages
  }
}

function loadPlugin(): {
  plugin: Plugin
  stubs: ReturnType<typeof makeStubs>
  messages: Array<{ id: string; delta: SKDelta }>
} {
  const stubs = makeStubs()
  const createPlugin = requireFresh<PluginFactory>('src/index', {
    'src/serial': stubs.serial,
    'src/udp': stubs.udp,
    'src/tcp': stubs.tcp
  })
  const { app, messages } = makeApp()
  return { plugin: createPlugin(app), stubs, messages }
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
