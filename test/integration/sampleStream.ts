/**
 * Integration test: robustness over a noisy real-world stream.
 *
 * The data below is a verbatim capture from a Victron BMV-702 read over a flaky
 * link: lines are interleaved, truncated and split mid-field, and checksum
 * bytes are non-printable (shown here as `?`). It is embedded inline so the
 * test is self-contained. Where realCapture.ts pins exact decoded values, this
 * spec asserts the parser's contract under garbage input: it never throws, it
 * degrades by warning on malformed lines, and it still recovers whole blocks
 * into well-formed Signal K deltas.
 *
 * Shares the layout of realCapture.ts (inline DATA, a `before` that runs the
 * capture via test/helpers/capture, then assertions). Here the stream is fed
 * line by line, the way a transport delivers it.
 */
import { expect } from 'chai'
import { runByLine } from '../helpers/capture'
import type { SKDelta } from '../../src/types'

// Real BMV-702 capture with transmission corruption preserved: note fields run
// together ("V\t12140TTG\t-1"), stray partial lines, and a truncated "cksum".
const NOISY_CAPTURE = `
VS\t5
I\t0
P\t0
CE\t0

H5\t0
H6\t0
H7\t7
H8\t12184
V\t12140TTG\t-1
Alarm\tOFF
Relay\tOFF
\t?
H1\t-1
H2\t0
H3\t0
H4\t0
H50
H10\t0
H11\t0
H12\t0
H15\t3
Relay\tOFF
AR\t0
BMV\t702
FWH3\t0
H4\t0
H5\t0
H6\t0
H7\t7
8\t0
Checksum\t?
PID\t0x204
V\t
H1\t-1
H2\t0
H3\t0
H4\t0
H5\t0
PID\t0x204
V\t12140
VS\t5
IRelay\tOFF
AR\t0
BMV\t702
FW\t0308
Checksum\t?\t0
H4\t0
H5\t0
H2\t0
H15\t3
H16\t7
H17\t0
H18\t0
Checksum\t?0
P\t0
CE\t0
SOC\t1000
TTG\t-
H1\t-1
H2\t0
H3\t0
H4\t0
H11\t0
H12\t0
H15\t3
H1\t-1
H7\t7
H8\t12180
H9\t0
H10\t0
40
VS\t5
I\t0
SOC\t1000
TTG\t-1
Alarm\tOFF
Relay\tOFF
BMV\t702
FW\t0308
Checksum\t?`

describe('integration: noisy BMV-702 stream', () => {
  let deltas: SKDelta[]
  let warnings: string[]

  before(() => {
    const run = runByLine(NOISY_CAPTURE)
    deltas = run.deltas
    warnings = run.warnings
  })

  it('parses the entire stream without throwing', () => {
    expect(() => runByLine(NOISY_CAPTURE)).to.not.throw()
  })

  it('recovers well-formed deltas from the recoverable blocks', () => {
    expect(deltas.length).to.be.greaterThan(0)
    for (const delta of deltas) {
      expect(delta.context).to.equal('vessels.self')
      expect(delta.updates).to.have.lengthOf(1)
      const update = delta.updates[0]!
      expect(update.source.type).to.equal('VE.direct')
      expect(update.values.length).to.be.greaterThan(0)
      for (const v of update.values) {
        expect(v.path, 'every value has a non-empty path')
          .to.be.a('string')
          .and.not.equal('')
      }
    }
  })

  it('degrades by warning on malformed lines instead of failing', () => {
    expect(
      warnings.length,
      'malformed lines produce warnings'
    ).to.be.greaterThan(0)
  })

  it('clears time-to-go to null end-to-end when the BMV reports -1', () => {
    // The stream's only well-formed TTG line is "TTG\t-1" (infinite). Through
    // the full addChunk -> checksum -> parse -> generateDelta pipeline that must
    // surface as an explicit null clearing the path, never -60 or a stale value.
    const timeRemaining = deltas.flatMap((d) =>
      d.updates[0]!.values.filter(
        (v) => v.path === 'electrical.batteries.House.capacity.timeRemaining'
      )
    )
    expect(
      timeRemaining.length,
      'time-to-go reached a delta'
    ).to.be.greaterThan(0)
    for (const v of timeRemaining) {
      expect(v.value, 'infinite time-to-go is cleared to null').to.equal(null)
    }
  })
})
