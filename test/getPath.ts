/**
 * Unit tests for VEDirectParser.getPath / unit-id resolution.
 *
 * Pins the behaviour that the field table's `unitId` is substituted into the
 * `*` placeholder of a field path: the four configurable units come from the
 * connection config, while aux2Batt/inverter (which have no config slot) fall
 * back to the parser's defaultUnitId.
 */
import { expect } from 'chai'
import { VEDirectParser } from '../src/Parser'

const parser = new VEDirectParser({
  vedirect: [
    {
      device: 'UDP',
      connection: 'localhost',
      port: 7878,
      ignoreChecksum: true,
      mainBatt: 'House',
      auxBatt: 'Starter',
      bmv: 'BMV',
      solar: 'Main'
    }
  ]
})

describe('VEDirectParser.getPath unit-id resolution', () => {
  it('substitutes the configured device name for the four configurable units', () => {
    expect(parser.getPath('mainBattVoltage', 0)).to.equal(
      'electrical.batteries.House.voltage'
    )
    expect(parser.getPath('auxBattVoltage', 0)).to.equal(
      'electrical.batteries.Starter.voltage'
    )
    expect(parser.getPath('relay', 0)).to.equal(
      'electrical.batteries.BMV.relay'
    )
    expect(parser.getPath('panelVoltage', 0)).to.equal(
      'electrical.solar.Main.panelVoltage'
    )
  })

  it('falls back to defaultUnitId for units without a config slot', () => {
    // V3 -> aux2Batt, AC_OUT_V -> inverter; neither has a connection field.
    expect(parser.getPath('aux2BattVoltage', 0)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
    expect(parser.getPath('acOutputVoltage', 0)).to.equal(
      'electrical.ac.victronDevice.phase.A.lineLineVoltage'
    )
  })

  it('returns null for fields without a Signal K path', () => {
    expect(parser.getPath('firmwareVersion', 0)).to.equal(null)
    expect(parser.getPath('serialNumber', 0)).to.equal(null)
  })

  it('uses defaultUnitId when the configured name is blank', () => {
    const blank = new VEDirectParser({
      vedirect: [
        {
          device: 'UDP',
          connection: 'localhost',
          port: 7878,
          ignoreChecksum: true,
          mainBatt: '',
          auxBatt: 'Starter',
          bmv: 'BMV',
          solar: 'Main'
        }
      ]
    })
    expect(blank.getPath('mainBattVoltage', 0)).to.equal(
      'electrical.batteries.victronDevice.voltage'
    )
  })
})
