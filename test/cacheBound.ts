/**
 * Tests the parser's bounded cache: a stream that never emits a Checksum line
 * must not grow the in-memory cache without limit, while a normal block still
 * accumulates until its Checksum arrives.
 */
import { expect } from 'chai'
import { VEDirectParser } from '../src/Parser'
import type { PluginOptions } from '../src/types'

const config: PluginOptions = {
  vedirect: [
    {
      device: 'UDP',
      connection: 'localhost',
      port: 7878,
      ignoreChecksum: true,
      mainBatt: 'House',
      auxBatt: 'Starter',
      bmv: 'bmv',
      solar: 'Main'
    }
  ]
}

describe('VEDirectParser cache bound', () => {
  it('discards an over-long block that never terminates with a Checksum', () => {
    const parser = new VEDirectParser(config)

    let warned = false
    parser.on('warn', () => {
      warned = true
    })

    // Feed well over the cache cap with no "Checksum" line.
    const junk = Buffer.from(`X\t${'A'.repeat(1000)}\n`)
    for (let i = 0; i < 12; i++) {
      parser.addChunk(junk, 0)
    }

    expect(warned).to.equal(true)
    expect(parser.cache.length).to.be.lessThan(8192)
  })

  it('keeps buffering a normal block until its Checksum arrives', () => {
    const parser = new VEDirectParser(config)

    const deltas: unknown[] = []
    parser.on('delta', (d) => deltas.push(d))

    parser.addChunk(Buffer.from('\nV\t12000\n'), 0)
    expect(parser.cache.length).to.be.greaterThan(0) // still buffering
    expect(deltas.length).to.equal(0)

    parser.addChunk(Buffer.from('Checksum\t?\n'), 0)
    expect(deltas.length).to.equal(1) // block completed and emitted
    expect(parser.cache).to.equal('') // reset after parse
  })
})
