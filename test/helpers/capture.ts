/**
 * Shared setup for the VE.Direct integration tests.
 *
 * Both integration specs drive the parser the same way: build a parser from a
 * standard single-connection config, feed it raw VE.Direct bytes, and collect
 * the emitted Signal K deltas. Centralising the wiring here lets each spec keep
 * the same shape and focus on its own assertions - decoded values in one,
 * noisy-stream robustness in the other.
 */
import { VEDirectParser } from '../../src/Parser'
import type { PluginOptions, SKDelta } from '../../src/types'

/** A single UDP connection naming the four configurable devices. The names
 *  map onto the `*` placeholder in each field path during assertions. */
export const STANDARD_OPTIONS: PluginOptions = {
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

/**
 * Serialises label/value pairs into one on-the-wire VE.Direct block.
 * Input:  [['PID', '0xA04C'], ['V', '14990'], ['Checksum', '?']]
 * Output: "PID\t0xA04C\nV\t14990\nChecksum\t?"
 */
export function toBlock(
  pairs: ReadonlyArray<readonly [string, string]>
): string {
  return pairs.map(([label, value]) => `${label}\t${value}`).join('\n')
}

/** Result of running a capture through a parser. */
export interface CaptureRun {
  parser: VEDirectParser
  deltas: SKDelta[]
  warnings: string[]
}

/** Feeds `wire` into a fresh parser as a single chunk (one framed block) and
 *  returns the parser plus every delta it emitted. */
export function runBlock(
  wire: string,
  options: PluginOptions = STANDARD_OPTIONS
): CaptureRun {
  return feed(options, (parser) => {
    parser.addChunk(Buffer.from(`\n${wire}`), 0)
  })
}

/** Feeds `wire` into a fresh parser one line at a time, mirroring how the
 *  transports deliver a streamed (and here, deliberately noisy) capture. */
export function runByLine(
  wire: string,
  options: PluginOptions = STANDARD_OPTIONS
): CaptureRun {
  return feed(options, (parser) => {
    wire.split('\n').forEach((line) => {
      parser.addChunk(Buffer.from(`\n${line}`), 0)
    })
  })
}

function feed(
  options: PluginOptions,
  drive: (parser: VEDirectParser) => void
): CaptureRun {
  const parser = new VEDirectParser(options)
  const deltas: SKDelta[] = []
  const warnings: string[] = []
  parser.on('delta', (d: SKDelta) => deltas.push(d))
  parser.on('warn', (m: string) => warnings.push(m))
  drive(parser)
  return { parser, deltas, warnings }
}
