/**
 * Unit tests for VEDirectParser (src/Parser.ts).
 *
 * Covers the byte-accumulation / checksum / parse pipeline, the small key-value
 * store and its events, the enum decoders (every documented code plus the
 * unknown fall-through), product-name lookup, path resolution, and delta
 * generation. Each test drives the public API; the few white-box pokes (set
 * `parser.line` directly, call a private) are called out where they appear.
 */
import { expect } from 'chai'
import { VEDirectParser } from '../../src/Parser'
import type { PluginOptions, SKDelta, StoredField } from '../../src/types'

const CONNECTION: PluginOptions = {
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

/** Sums every byte of `s`; used to pad a block so its running sum is a chosen
 *  residue mod 256 (the parser's checksum rule). */
function byteSum(s: string): number {
  return [...Buffer.from(s, 'ascii')].reduce((acc, b) => acc + b, 0)
}

/** Builds a buffer for `body` (which must contain a Checksum line) padded so
 *  the total byte sum is congruent to `residue` mod 256. */
function blockWithResidue(body: string, residue: number): Buffer {
  const pad = (residue - (byteSum(body) % 256) + 256) % 256
  return Buffer.concat([Buffer.from(body, 'ascii'), Buffer.from([pad])])
}

describe('VEDirectParser - construction', () => {
  it('applies defaults when constructed without options', () => {
    const parser = new VEDirectParser()
    expect(parser.options.defaultUnitId).to.equal('victronDevice')
    expect(parser.options.mainBatt).to.equal('house')
    expect(parser.options.auxBatt).to.equal('starter')
    expect(parser.fields['V']).to.not.equal(undefined)
    expect(parser.data).to.deep.equal({})
  })

  it('merges caller options over the defaults', () => {
    const parser = new VEDirectParser(CONNECTION)
    expect(parser.options.vedirect?.[0]?.mainBatt).to.equal('House')
    // Defaults still present for keys the caller did not set.
    expect(parser.options.defaultUnitId).to.equal('victronDevice')
  })
})

describe('VEDirectParser - key/value store', () => {
  let parser: VEDirectParser
  beforeEach(() => {
    parser = new VEDirectParser(CONNECTION)
  })

  it('set() stores the value and emits set + change', () => {
    const seen: string[] = []
    parser.on('set', (e: { key: string; value: StoredField }) =>
      seen.push(`set:${e.key}`)
    )
    parser.on('change', () => seen.push('change'))

    const value: StoredField = { name: 'mainBattVoltage', value: 12.3 }
    parser.set('mainBattVoltage', value)

    expect(parser.get('mainBattVoltage')).to.deep.equal(value)
    expect(seen).to.deep.equal(['change', 'set:mainBattVoltage'])
  })

  it('get() returns undefined for an unknown key', () => {
    expect(parser.get('nope')).to.equal(undefined)
  })

  it('unset() on a missing key is a no-op and emits nothing', () => {
    let events = 0
    parser.on('unset', () => (events += 1))
    parser.on('change', () => (events += 1))
    parser.unset('missing')
    expect(events).to.equal(0)
  })

  it('unset() removes an existing key and emits unset + change', () => {
    parser.set('relay', { name: 'relay', value: 1 })
    const seen: string[] = []
    parser.on('unset', (key: string) => seen.push(`unset:${key}`))
    parser.on('change', () => seen.push('change'))

    parser.unset('relay')

    expect(parser.get('relay')).to.equal(undefined)
    expect(seen).to.deep.equal(['change', 'unset:relay'])
  })

  it('getData() returns a shallow copy, not the live store', () => {
    parser.set('relay', { name: 'relay', value: 1 })
    const snapshot = parser.getData()
    delete snapshot['relay']
    expect(parser.get('relay')).to.not.equal(undefined)
  })
})

describe('VEDirectParser - parse()', () => {
  let parser: VEDirectParser
  let warnings: string[]
  beforeEach(() => {
    parser = new VEDirectParser(CONNECTION)
    warnings = []
    parser.on('warn', (m: string) => warnings.push(m))
  })

  it('ignores a non-string line without throwing', () => {
    expect(() => parser.parse(123 as unknown as string)).to.not.throw()
    expect(warnings).to.have.lengthOf(0)
  })

  it('warns on a line that is not exactly label<TAB>value', () => {
    parser.parse('PID') // no tab -> arity 1
    parser.parse('a\tb\tc') // arity 3
    expect(warnings).to.have.lengthOf(2)
    warnings.forEach((w) => expect(w).to.contain('_parse() called on invalid'))
  })

  it('warns and skips an unknown field label', () => {
    parser.parse('ZZZ\t1')
    expect(warnings[0]).to.contain('No field definition for: ZZZ')
    expect(parser.get('ZZZ')).to.equal(undefined)
  })

  it('stores the raw token for a field without a converter', () => {
    parser.parse('FW\t0150')
    expect(parser.get('firmwareVersion')?.value).to.equal('0150')
  })

  it('trims surrounding whitespace before splitting the line', () => {
    parser.parse('  FW\t0150  ')
    expect(parser.get('firmwareVersion')?.value).to.equal('0150')
  })

  it('skips a field whose converter returns undefined', () => {
    parser.parse('V\tnot-a-number')
    expect(parser.get('mainBattVoltage')).to.equal(undefined)
  })

  it('warns when a parsed line has an undefined value half', () => {
    // White-box: drive _parse with a length-2 line holding an undefined, which
    // split() never produces but the runtime guard still defends against.
    parser.line = ['V', undefined as unknown as string]
    ;(parser as unknown as { _parse(): void })._parse()
    expect(warnings[0]).to.contain('Data is NULL')
  })
})

describe('VEDirectParser - addChunk() and checksum', () => {
  const BODY = 'PID\t0x204\nV\t12340\nChecksum\t1'

  it('rejects a non-buffer chunk with a warning', () => {
    const parser = new VEDirectParser(CONNECTION)
    const warnings: string[] = []
    parser.on('warn', (m: string) => warnings.push(m))
    parser.addChunk('not a buffer' as unknown as Buffer, 0)
    expect(warnings[0]).to.contain('not a buffer')
  })

  it('accumulates chunks without a Checksum line and emits nothing', () => {
    const parser = new VEDirectParser(CONNECTION)
    let deltas = 0
    parser.on('delta', () => (deltas += 1))
    parser.addChunk(Buffer.from('\nPID\t0x204\n'), 0)
    expect(deltas).to.equal(0)
    expect(parser.cache).to.contain('PID')
  })

  it('parses a block and emits a delta when ignoreChecksum is set', () => {
    const parser = new VEDirectParser(CONNECTION)
    const deltas: SKDelta[] = []
    parser.on('delta', (d: SKDelta) => deltas.push(d))
    parser.addChunk(Buffer.from(`\n${BODY}`), 0)
    expect(deltas).to.have.lengthOf(1)
    expect(parser.get('mainBattVoltage')?.value).to.equal(12.34)
    // cache and running sum reset after a block.
    expect(parser.cache).to.equal('')
    expect(parser.sum).to.equal(0)
  })

  it('detects the Checksum terminator case-insensitively', () => {
    const parser = new VEDirectParser(CONNECTION)
    let deltas = 0
    parser.on('delta', () => (deltas += 1))
    parser.addChunk(Buffer.from('\nV\t12340\nchecksum\t1'), 0)
    expect(deltas).to.equal(1)
  })

  it('drops a block whose checksum is wrong when verification is on', () => {
    const strict: PluginOptions = {
      vedirect: [{ ...CONNECTION.vedirect![0]!, ignoreChecksum: false }]
    }
    const parser = new VEDirectParser(strict)
    const warnings: string[] = []
    let deltas = 0
    parser.on('warn', (m: string) => warnings.push(m))
    parser.on('delta', () => (deltas += 1))

    parser.addChunk(blockWithResidue(BODY, 1), 0) // residue 1 != 0 -> rejected

    expect(deltas).to.equal(0)
    expect(warnings.some((w) => w.includes("block checksum doesn't equal 0")))
      .to.be.true
    expect(parser.cache).to.equal('')
    expect(parser.sum).to.equal(0)
  })

  it('accepts a block whose checksum is valid when verification is on', () => {
    const strict: PluginOptions = {
      vedirect: [{ ...CONNECTION.vedirect![0]!, ignoreChecksum: false }]
    }
    const parser = new VEDirectParser(strict)
    const deltas: SKDelta[] = []
    parser.on('delta', (d: SKDelta) => deltas.push(d))

    parser.addChunk(blockWithResidue(BODY, 0), 0) // residue 0 -> accepted

    expect(deltas).to.have.lengthOf(1)
  })

  it('verifies the checksum when the connection index has no config', () => {
    // conn is undefined (index out of range) -> ignoreChecksum is treated as
    // not-true, so the checksum is enforced.
    const parser = new VEDirectParser(CONNECTION)
    let deltas = 0
    const warnings: string[] = []
    parser.on('delta', () => (deltas += 1))
    parser.on('warn', (m: string) => warnings.push(m))

    parser.addChunk(blockWithResidue(BODY, 5), 9) // bad checksum at unknown index
    expect(deltas).to.equal(0)
    expect(warnings.some((w) => w.includes('block checksum'))).to.be.true
  })

  it('keeps buffering a block until its Checksum line arrives', () => {
    const parser = new VEDirectParser(CONNECTION)
    let deltas = 0
    parser.on('delta', () => (deltas += 1))

    parser.addChunk(Buffer.from('\nV\t12000\n'), 0)
    expect(parser.cache.length, 'still buffering').to.be.greaterThan(0)
    expect(deltas).to.equal(0)

    parser.addChunk(Buffer.from('Checksum\t?\n'), 0)
    expect(deltas).to.equal(1)
    expect(parser.cache).to.equal('')
  })

  it('discards an over-long block that never sends a Checksum', () => {
    // A malformed device or lost sentinel must not grow the cache without
    // bound; once it passes the cap the accumulated cache is dropped.
    const parser = new VEDirectParser(CONNECTION)
    const warnings: string[] = []
    parser.on('warn', (m: string) => warnings.push(m))

    // Feed ~1 KB chunks (no Checksum) until the cap trips. The capped loop
    // bounds the run if a mutant disables the discard, so the assertions fail
    // rather than spinning forever.
    const junk = Buffer.from(`X\t${'A'.repeat(1000)}\n`)
    for (let i = 0; i < 100 && warnings.length === 0; i++) {
      parser.addChunk(junk, 0)
    }

    expect(warnings.some((w) => w.includes('discarding'))).to.be.true
    // The overflowing chunk resets the cache to empty (not to some other value).
    expect(parser.cache, 'cache reset on the overflowing chunk').to.equal('')
  })
})

describe('VEDirectParser - enum decoders', () => {
  const parser = new VEDirectParser(CONNECTION)

  it('decodes every alarm reason and falls through to undefined', () => {
    const cases: Array<[number, string | undefined]> = [
      [1, 'Low voltage'],
      [2, 'High voltage'],
      [4, 'Low state-of-charge'],
      [8, 'Low starter voltage'],
      [16, 'High starter voltage'],
      [32, 'Low temperature'],
      [64, 'High temperature'],
      [128, 'Mid voltage'],
      [256, 'Overload'],
      [512, 'DC ripple'],
      [1024, 'Low V AC out'],
      [2048, 'High V AC out'],
      [0, undefined],
      [3, undefined]
    ]
    for (const [input, expected] of cases) {
      expect(parser.getAlarmReason(input), `AR ${input}`).to.equal(expected)
    }
    // Accepts the raw string form too (tokens arrive as strings on the wire).
    expect(parser.getAlarmReason('256')).to.equal('Overload')
  })

  it('decodes every error code and falls through to undefined', () => {
    const cases: Array<[number, string | undefined]> = [
      [2, 'Battery voltage too high'],
      [17, 'Charger temperature too high'],
      [18, 'Charger overcurrent'],
      [20, 'Bulk time limit exceeded'],
      [26, 'Terminals overheated'],
      [33, 'Input voltage too high (solar panel)'],
      [34, 'Input current too high (solar panel)'],
      [38, 'Input shutdown (due to excessive battery voltage)'],
      [116, 'Factory calibration data lost'],
      [117, 'Invalid/incompatible firmware'],
      [119, 'User settings invalid'],
      [0, undefined],
      [19, undefined] // documented as ignorable -> undefined
    ]
    for (const [input, expected] of cases) {
      expect(parser.getErrorString(input), `ERR ${input}`).to.equal(expected)
    }
    expect(parser.getErrorString('2')).to.equal('Battery voltage too high')
  })

  it('decodes device mode and falls through to undefined', () => {
    expect(parser.getMode(2)).to.equal('on')
    expect(parser.getMode(4)).to.equal('off')
    expect(parser.getMode(5)).to.equal('eco')
    expect(parser.getMode(1)).to.equal(undefined)
  })

  it('decodes charger state of operation and falls through to undefined', () => {
    const cases: Array<[number, string | undefined]> = [
      [0, 'off'],
      [1, 'low power'],
      [2, 'fault'],
      [3, 'bulk'],
      [4, 'absorption'],
      [5, 'float'],
      [9, 'inverting'],
      [7, undefined]
    ]
    for (const [input, expected] of cases) {
      expect(parser.getStateOfOperation(input), `CS ${input}`).to.equal(
        expected
      )
    }
  })

  it('decodes tracker operation mode and falls through to undefined', () => {
    expect(parser.getTrackerOperationMode(0)).to.equal('off')
    expect(parser.getTrackerOperationMode(1)).to.equal(
      'voltage or current limited'
    )
    expect(parser.getTrackerOperationMode(2)).to.equal('mpp tracker active')
    expect(parser.getTrackerOperationMode(3)).to.equal(undefined)
  })
})

describe('VEDirectParser - getProductLongname()', () => {
  const parser = new VEDirectParser(CONNECTION)

  it('looks up a model name from a 0x-prefixed id', () => {
    expect(parser.getProductLongname('0xA053')).to.equal(
      'SmartSolar MPPT 75/15'
    )
  })

  it('adds a missing 0x prefix before lookup', () => {
    expect(parser.getProductLongname('A053')).to.equal('SmartSolar MPPT 75/15')
  })

  it('returns Unknown for an unmapped id', () => {
    expect(parser.getProductLongname('0xFFFF')).to.equal('Unknown')
    expect(parser.getProductLongname('ZZZ')).to.equal('Unknown')
  })
})

describe('VEDirectParser - getPath()', () => {
  const parser = new VEDirectParser(CONNECTION)

  it('substitutes each configured device name', () => {
    expect(parser.getPath('mainBattVoltage', 0)).to.equal(
      'electrical.batteries.House.voltage'
    )
    expect(parser.getPath('auxBattVoltage', 0)).to.equal(
      'electrical.batteries.Starter.voltage'
    )
    expect(parser.getPath('relay', 0)).to.equal(
      'electrical.batteries.bmv.relay'
    )
    expect(parser.getPath('panelVoltage', 0)).to.equal(
      'electrical.solar.Main.panelVoltage'
    )
  })

  it('falls back to defaultUnitId for units with no config slot', () => {
    expect(parser.getPath('aux2BattVoltage', 0)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(parser.getPath('acOutputVoltage', 0)).to.equal(
      'electrical.ac.victronDevice.phase.A.lineLineVoltage'
    )
  })

  it('falls back to defaultUnitId when a configured name is blank', () => {
    const blank = new VEDirectParser({
      vedirect: [
        {
          ...CONNECTION.vedirect![0]!,
          mainBatt: '',
          auxBatt: '',
          bmv: '',
          solar: ''
        }
      ]
    })
    // Exercises the blank fallback for each configurable unit.
    expect(blank.getPath('mainBattVoltage', 0)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(blank.getPath('auxBattVoltage', 0)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(blank.getPath('relay', 0)).to.equal(
      'electrical.batteries.victronDevice.relay'
    )
    expect(blank.getPath('panelVoltage', 0)).to.equal(
      'electrical.solar.victronDevice.panelVoltage'
    )
  })

  it('falls back to defaultUnitId when the connection index is unknown', () => {
    // conn is undefined at index 9; conn?.<unit> must yield defaultUnitId for
    // every configurable unit rather than throwing.
    expect(parser.getPath('mainBattVoltage', 9)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(parser.getPath('auxBattVoltage', 9)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(parser.getPath('relay', 9)).to.equal(
      'electrical.batteries.victronDevice.relay'
    )
    expect(parser.getPath('panelVoltage', 9)).to.equal(
      'electrical.solar.victronDevice.panelVoltage'
    )
  })

  it('returns a path verbatim, placeholder intact, when there is no unitId', () => {
    const custom = new VEDirectParser(CONNECTION)
    custom.fields = {
      ...custom.fields,
      CUSTOM: { name: 'customReading', path: 'sensors.*.value' }
    }
    // No unitId means no substitution, so the * placeholder is left untouched.
    expect(custom.getPath('customReading', 0)).to.equal('sensors.*.value')
  })

  it('returns null for a field with no path and for an unknown name', () => {
    expect(parser.getPath('firmwareVersion', 0)).to.equal(null)
    expect(parser.getPath('serialNumber', 0)).to.equal(null)
    expect(parser.getPath('noSuchField', 0)).to.equal(null)
  })
})

describe('VEDirectParser - generateDelta()', () => {
  it('warns and emits nothing when no stored field has a path', () => {
    const parser = new VEDirectParser(CONNECTION)
    const warnings: string[] = []
    let deltas = 0
    parser.on('warn', (m: string) => warnings.push(m))
    parser.on('delta', () => (deltas += 1))

    parser.parse('FW\t0150') // firmwareVersion has no path
    parser.generateDelta(0)

    expect(deltas).to.equal(0)
    expect(warnings.some((w) => w.includes('No mutations in this delta'))).to.be
      .true
  })

  it('emits a self-context delta with only the path-mapped values', () => {
    const parser = new VEDirectParser(CONNECTION)
    const deltas: SKDelta[] = []
    parser.on('delta', (d: SKDelta) => deltas.push(d))

    parser.parse('V\t12340') // mapped -> electrical.batteries.House.voltage
    parser.parse('FW\t0150') // unmapped -> excluded from the delta
    parser.generateDelta(0)

    expect(deltas).to.have.lengthOf(1)
    const update = deltas[0]!.updates[0]!
    expect(deltas[0]!.context).to.equal('vessels.self')
    expect(update.source).to.deep.equal({
      label: '@signalk/vedirect-serial-usb',
      type: 'VE.direct'
    })
    expect(new Date(update.timestamp).toISOString()).to.equal(update.timestamp)
    expect(update.values).to.deep.equal([
      { path: 'electrical.batteries.House.voltage', value: 12.34 }
    ])
  })
})

describe('VEDirectParser - clearing values (explicit null)', () => {
  let parser: VEDirectParser
  beforeEach(() => {
    parser = new VEDirectParser(CONNECTION)
  })

  it('stores an explicit null when a converter returns null', () => {
    // A null return means "clear this reading" (TTG -1 = infinite), distinct
    // from undefined which means "skip". The store must hold the null so a
    // prior value is overwritten rather than left stale.
    parser.parse('TTG\t-1')
    expect(
      parser.get('timeToGo'),
      'timeToGo is stored, not skipped'
    ).to.not.equal(undefined)
    expect(parser.get('timeToGo')?.value).to.equal(null)
  })

  it('overwrites a prior finite time-to-go with null when it goes infinite', () => {
    // Regression for the discharge -> charge transition: once charging starts
    // the BMV reports TTG -1, and the consumer must see null rather than the
    // stale estimate (or the old -60 from naive minutes*60 on -1).
    parser.parse('TTG\t600')
    expect(parser.get('timeToGo')?.value).to.equal(36000)
    parser.parse('TTG\t-1')
    expect(parser.get('timeToGo')?.value).to.equal(null)
  })

  it('emits the cleared value as null in the generated delta', () => {
    const deltas: SKDelta[] = []
    parser.on('delta', (d: SKDelta) => deltas.push(d))

    parser.parse('TTG\t-1')
    parser.generateDelta(0)

    expect(deltas).to.have.lengthOf(1)
    expect(deltas[0]!.updates[0]!.values).to.deep.equal([
      {
        path: 'electrical.batteries.House.capacity.timeRemaining',
        value: null
      }
    ])
  })
})

describe('VEDirectParser - diagnostics', () => {
  it('warn() emits the message on the warn channel', () => {
    const parser = new VEDirectParser(CONNECTION)
    let message = ''
    parser.on('warn', (m: string) => (message = m))
    parser.warn('something off')
    expect(message).to.equal('something off')
  })

  it('error() emits the error on the error channel', () => {
    const parser = new VEDirectParser(CONNECTION)
    const err = new Error('boom')
    let received: Error | null = null
    parser.on('error', (e: Error) => (received = e))
    parser.error(err)
    expect(received).to.equal(err)
  })
})
