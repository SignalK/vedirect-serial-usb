/**
 * Real-world parser test against an actual VE.Direct capture.
 *
 * The frame below is a verbatim capture from a Victron BlueSolar MPPT 75/10
 * solar charger (PID 0xA04C), embedded inline so the test is self-contained.
 * It exercises the full path: byte accumulation, the Checksum-terminated block
 * boundary, field decoding and unit conversion, and Signal K delta generation.
 * Checksum verification is disabled (ignoreChecksum) because the captured
 * checksum byte is not reproduced here; the field decoding is what matters.
 */
import { expect } from 'chai'
import { VEDirectParser } from '../src/Parser'
import type { SKDelta } from '../src/types'

// One VE.Direct frame as label/value pairs, serialised to the on-the-wire
// format (tab between label and value, newline between lines, terminated by a
// Checksum field). The Checksum value is a placeholder since verification is
// disabled below.
const CAPTURE: ReadonlyArray<readonly [string, string]> = [
  ['PID', '0xA04C'],
  ['FW', '127'],
  ['SER#', 'HQ1621FRG7Z'],
  ['V', '14990'],
  ['I', '2770'],
  ['VPV', '20450'],
  ['PPV', '42'],
  ['CS', '4'],
  ['ERR', '0'],
  ['LOAD', 'OFF'],
  ['IL', '0'],
  ['H19', '6078'],
  ['H20', '14'],
  ['H21', '100'],
  ['H22', '52'],
  ['H23', '148'],
  ['HSDS', '208'],
  ['Checksum', '?']
]

const block = CAPTURE.map(([label, value]) => `${label}\t${value}`).join('\n')

describe('VE.Direct parser - real BlueSolar MPPT 75/10 capture', () => {
  let delta: SKDelta
  let parser: VEDirectParser

  before(() => {
    parser = new VEDirectParser({
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
    })

    const deltas: SKDelta[] = []
    parser.on('delta', (d) => deltas.push(d))

    parser.addChunk(Buffer.from(`\n${block}`), 0)

    expect(deltas.length).to.equal(1)
    delta = deltas[0]!
  })

  it('emits a single self-context delta tagged as a VE.direct source', () => {
    expect(delta.context).to.equal('vessels.self')
    expect(delta.updates).to.have.lengthOf(1)
    expect(delta.updates[0]!.source.type).to.equal('VE.direct')
    expect(delta.updates[0]!.source.label).to.equal(
      '@signalk/vedirect-serial-usb'
    )
  })

  it('decodes every path-mapped field with the correct unit conversion', () => {
    const values = delta.updates[0]!.values
    const valueAt = (path: string): number | string => {
      const found = values.find((v) => v.path === path)
      expect(found, `expected a value at ${path}`).to.not.equal(undefined)
      return found!.value
    }

    // Only fields with a Signal K path appear in the delta; FW, SER#, HSDS
    // and the product id/name are decoded but have no path, and ERR 0 maps
    // to null (no error) so it is skipped.
    expect(values).to.have.lengthOf(12)

    // Battery (mainBatt -> "House"): mV and mA conversions.
    expect(valueAt('electrical.batteries.House.voltage')).to.equal(14.99) // V 14990 mV
    expect(valueAt('electrical.batteries.House.current')).to.equal(2.77) // I 2770 mA
    expect(valueAt('electrical.charger.House.chargingMode')).to.equal(
      'absorption'
    ) // CS 4

    // Solar (solar -> "Main").
    expect(valueAt('electrical.solar.Main.panelVoltage')).to.equal(20.45) // VPV 20450 mV
    expect(valueAt('electrical.solar.Main.panelPower')).to.equal(42) // PPV 42 W
    expect(valueAt('electrical.solar.Main.load')).to.equal('off') // LOAD OFF
    expect(valueAt('electrical.solar.Main.loadCurrent')).to.equal(0) // IL 0 mA
    expect(valueAt('electrical.solar.Main.yieldTotal')).to.equal(60.78) // H19 6078 (0.01 kWh)
    expect(valueAt('electrical.solar.Main.yieldToday')).to.equal(0.14) // H20 14
    expect(valueAt('electrical.solar.Main.maximumPowerToday')).to.equal(100) // H21
    expect(valueAt('electrical.solar.Main.yieldYesterday')).to.equal(0.52) // H22 52
    expect(valueAt('electrical.solar.Main.maximumPowerYesterday')).to.equal(148) // H23
  })

  it('identifies the device from PID, firmware and serial number', () => {
    const data = parser.getData()
    expect(data['productName']?.value).to.equal('BlueSolar MPPT 75/10') // PID 0xA04C
    expect(data['productId']?.value).to.equal('0xA04C')
    expect(data['firmwareVersion']?.value).to.equal('127') // FW
    expect(data['serialNumber']?.value).to.equal('HQ1621FRG7Z') // SER#
  })
})
