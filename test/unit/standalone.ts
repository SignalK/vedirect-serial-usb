/**
 * Unit tests for the standalone library wrapper (src/standalone.ts).
 *
 * VEDirect builds the real plugin and starts it in its constructor, so the
 * transports are stubbed (and the intermediate index module re-loaded) to keep
 * the test off real ports. Covers: deltas re-emitted as `delta` events, other
 * host messages re-emitted under their own channel, the debug on/off switch,
 * and the guards for a plugin missing start/stop.
 */
import { expect } from 'chai'
import { requireFresh } from '../helpers/moduleStub'
import type { SKDelta } from '../../src/types'
import type { VEDirectParser as ParserClass } from '../../src/Parser'

type StandaloneModule = typeof import('../../src/standalone')

/** Stub transports that capture the parser array index hands them, so a test
 *  can push a real frame through and observe the delta surfacing. */
function makeTransportStubs(): {
  stubs: Record<string, unknown>
  captured: () => { parser: ParserClass[]; index: number } | null
} {
  let captured: { parser: ParserClass[]; index: number } | null = null
  const grab = (parser: ParserClass[], index: number): void => {
    captured = { parser, index }
  }
  return {
    captured: () => captured,
    stubs: {
      'src/serial': {
        open: (_d: string, p: ParserClass[], _g: unknown, i: number) =>
          grab(p, i),
        close: () => {}
      },
      'src/udp': {
        listen: (_p: number, p: ParserClass[], _g: unknown, i: number) =>
          grab(p, i),
        close: () => {}
      },
      'src/tcp': {
        connect: (
          _h: string,
          _p: number,
          p: ParserClass[],
          _g: unknown,
          i: number
        ) => grab(p, i),
        close: () => {}
      }
    }
  }
}

function loadStandalone(stubs: Record<string, unknown>): StandaloneModule {
  return requireFresh<StandaloneModule>('src/standalone', stubs, ['src/index'])
}

describe('standalone wrapper', () => {
  it('re-emits parsed deltas as delta events', () => {
    const transports = makeTransportStubs()
    const VEDirect = loadStandalone(transports.stubs)

    const ve = new VEDirect() // default Serial config, ignoreChecksum on
    const deltas: SKDelta[] = []
    ve.on('delta', (d: SKDelta) => deltas.push(d))

    const grabbed = transports.captured()
    expect(grabbed, 'a transport captured the parser').to.not.equal(null)
    const parser = grabbed!.parser[grabbed!.index] as unknown as ParserClass
    parser.addChunk(Buffer.from('\nV\t12340\nChecksum\t1'), grabbed!.index)

    expect(deltas).to.have.lengthOf(1)
    expect(deltas[0]!.context).to.equal('vessels.self')
    ve.stop()
  })

  it('re-emits non-pluginId host messages under their own channel', () => {
    const transports = makeTransportStubs()
    const VEDirect = loadStandalone(transports.stubs)
    const ve = new VEDirect()

    const received: unknown[] = []
    ve.on('navigation', (d: unknown) => received.push(d))
    ;(
      ve as unknown as {
        app: { handleMessage: (kind: string, data: unknown) => void }
      }
    ).app.handleMessage('navigation', { sample: 1 })

    expect(received).to.deep.equal([{ sample: 1 }])
    ve.stop()
  })

  it('writes to the console only when debug is enabled', () => {
    const transports = makeTransportStubs()
    const VEDirect = loadStandalone(transports.stubs)
    const logs: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]): void => {
      logs.push(...args)
    }
    try {
      const quiet = new VEDirect({}, false)
      ;(quiet as unknown as { debug: (...a: unknown[]) => void }).debug(
        'hidden'
      )
      const loud = new VEDirect({}, true)
      ;(loud as unknown as { debug: (...a: unknown[]) => void }).debug('shown')
      quiet.stop()
      loud.stop()
    } finally {
      console.log = original
    }

    expect(logs).to.include('shown')
    expect(logs).to.not.include('hidden')
  })

  it('guards against a plugin missing start/stop', () => {
    const fakePlugin = { id: 'x', name: 'x', description: 'x', schema: {} }
    const VEDirect = requireFresh<StandaloneModule>('src/standalone', {
      'src/index': () => fakePlugin
    })

    const logs: unknown[] = []
    const original = console.log
    console.log = (...args: unknown[]): void => {
      logs.push(...args)
    }
    try {
      const ve = new VEDirect({}, true) // constructor start() hits the guard
      ve.stop() // stop() hits the guard
    } finally {
      console.log = original
    }

    const text = logs.map((m) => String(m))
    expect(text.some((m) => m.includes("can't start"))).to.be.true
    expect(text.some((m) => m.includes("can't stop"))).to.be.true
  })
})
