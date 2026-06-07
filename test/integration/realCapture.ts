/**
 * Integration test: decoded values from a real device capture.
 *
 * The frame below is a verbatim capture from a Victron BlueSolar MPPT 75/10
 * solar charger (PID 0xA04C), embedded inline so the test is self-contained.
 * It exercises the full path - byte accumulation, the Checksum-terminated block
 * boundary, field decoding and unit conversion, and Signal K delta generation -
 * and asserts the concrete decoded values. Checksum verification is disabled
 * (the captured checksum byte is not reproduced); the decoding is what matters.
 *
 * Its sibling, sampleStream.ts, shares this layout (inline DATA, a `before`
 * that runs the capture via test/helpers/capture, then assertions) but checks
 * robustness over a noisy stream rather than exact values.
 */
import { expect } from 'chai'
import { runBlock, toBlock, STANDARD_OPTIONS } from '../helpers/capture'
import type { VEDirectParser } from '../../src/Parser'
import type { PluginOptions, SKDelta } from '../../src/types'

// One VE.Direct frame as label/value pairs. The Checksum value is a placeholder
// since verification is disabled by the standard (ignoreChecksum) config.
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

// This capture is a solar charger, so configure the connection as one: its V/I
// (the charger's DC output) then land under electrical.solar instead of
// electrical.batteries, where they would clash with a battery monitor.
const MPPT_OPTIONS: PluginOptions = {
  vedirect: [{ ...STANDARD_OPTIONS.vedirect![0]!, deviceType: 'Solar charger' }]
}

describe('integration: real BlueSolar MPPT 75/10 capture', () => {
  let parser: VEDirectParser
  let delta: SKDelta
  let values: Array<{ path: string; value: number | string | null }>

  before(() => {
    const run = runBlock(toBlock(CAPTURE), MPPT_OPTIONS)
    expect(run.deltas, 'one delta per block').to.have.lengthOf(1)
    parser = run.parser
    delta = run.deltas[0]!
    values = delta.updates[0]!.values
  })

  const valueAt = (path: string): number | string | null => {
    const found = values.find((v) => v.path === path)
    expect(found, `expected a value at ${path}`).to.not.equal(undefined)
    return found!.value
  }

  it('emits a single self-context delta with a per-connection $source', () => {
    expect(delta.context).to.equal('vessels.self')
    expect(delta.updates).to.have.lengthOf(1)
    expect(delta.updates[0]!.$source).to.equal('vedirect-signalk.0')
  })

  it('decodes every path-mapped field with the correct unit conversion', () => {
    // Only fields with a Signal K path appear in the delta; FW, SER#, HSDS and
    // the product id/name are decoded but have no path, and ERR 0 maps to
    // undefined (no error) so it is skipped.
    expect(values).to.have.lengthOf(12)

    // This connection is a solar charger, so V and I describe its DC output and
    // are reported under electrical.solar rather than electrical.batteries.
    expect(valueAt('electrical.solar.Main.voltage')).to.equal(14.99) // V 14990 mV -> solar
    expect(valueAt('electrical.solar.Main.current')).to.equal(2.77) // I 2770 mA -> solar
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
    // PID, FW and SER# are decoded into the parser store but carry no Signal K
    // path, so they are read back from getData() rather than the delta.
    const data = parser.getData()
    expect(data['productName']?.value).to.equal('BlueSolar MPPT 75/10') // PID 0xA04C
    expect(data['productId']?.value).to.equal('0xA04C')
    expect(data['firmwareVersion']?.value).to.equal('127') // FW
    expect(data['serialNumber']?.value).to.equal('HQ1621FRG7Z') // SER#
  })
})
