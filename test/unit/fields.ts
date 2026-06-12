/**
 * Unit tests for the VE.Direct field table (src/fields.ts).
 *
 * Three concerns are covered:
 *  - the numeric converters (scaling, flooring, NaN -> null) exercised through
 *    the fields that use them;
 *  - the bespoke value functions (temperature, booleans, the PID side effects,
 *    and the enum delegations);
 *  - the static shape of every field (name / path / unitId / units / type),
 *    pinned so a rename or path typo - or a mutation of one - is caught.
 */
import { expect } from 'chai'
import fields from '../../src/fields'
import type { Field, FieldContext, StoredField } from '../../src/types'

/** Records the set() calls a field makes and returns sentinels from the enum
 *  decoders so delegation can be asserted without the real parser. */
function makeContext(): {
  ctx: FieldContext
  sets: Array<{ key: string; value: StoredField }>
} {
  const sets: Array<{ key: string; value: StoredField }> = []
  const ctx: FieldContext = {
    set: (key, value) => sets.push({ key, value }),
    getAlarmReason: () => 'ALARM_REASON',
    getErrorString: () => 'ERROR_STRING',
    getStateOfOperation: () => 'STATE',
    getMode: () => 'MODE_RESULT',
    getTrackerOperationMode: () => 'TRACKER',
    getProductLongname: () => 'PRODUCT_NAME'
  }
  return { ctx, sets }
}

/** Invokes the value converter of field `key` with a raw token. */
function convert(
  key: string,
  raw: string | number,
  ctx?: FieldContext
): unknown {
  const field = fields[key]
  if (field === undefined || field.value === undefined) {
    throw new Error(`field ${key} has no value converter`)
  }
  return field.value(raw as string, ctx ?? makeContext().ctx)
}

describe('fields - numeric converters', () => {
  // common.number, reached via PPV (panelPower).
  it('parses integers and skips non-numbers (number)', () => {
    expect(convert('PPV', '42')).to.equal(42)
    expect(convert('PPV', '-7')).to.equal(-7)
    expect(convert('PPV', 'not-a-number')).to.equal(undefined)
  })

  it('passes an already-numeric token through without re-parsing (number)', () => {
    // Guards the `typeof value === 'number'` branch: a float must survive
    // intact, not be truncated by the string parseInt path.
    expect(convert('PPV', 12.5)).to.equal(12.5)
  })

  it('scales millivolts to volts (mV)', () => {
    expect(convert('V', '12340')).to.equal(12.34)
    expect(convert('V', 'x')).to.equal(undefined)
  })

  it('floors tenths of a milliamp before scaling to amps (mA)', () => {
    // 2779 -> floor(277.9)=277 -> 2.77 (the floor must not round up to 2.78).
    expect(convert('I', '2779')).to.equal(2.77)
    expect(convert('I', '2770')).to.equal(2.77)
    expect(convert('I', 'x')).to.equal(undefined)
  })

  it('converts consumed charge to coulombs (mAh)', () => {
    // 1000 -> floor(100)/100=1 Ah -> 1 * 3600 = 3600 C.
    expect(convert('CE', '1000')).to.equal(3600)
    expect(convert('CE', 'x')).to.equal(undefined)
  })

  it('scales hundredths of a kWh to kWh (kWh)', () => {
    expect(convert('H17', '6078')).to.equal(218808000)
    expect(convert('H17', 'x')).to.equal(undefined)
  })

  it('scales per-mille to a ratio (promille)', () => {
    expect(convert('SOC', '1000')).to.equal(1)
    expect(convert('SOC', 'x')).to.equal(undefined)
  })
})

describe('fields - bespoke value functions', () => {
  it('offsets battery temperature into kelvin and rejects NaN', () => {
    expect(convert('T', '0')).to.equal(273.15)
    expect(convert('T', '25')).to.equal(298.15)
    expect(convert('T', 'x')).to.equal(undefined)
  })

  it('converts time-to-go from minutes to seconds, clears on infinite (TTG)', () => {
    // VE.Direct reports time-to-go in minutes; -1 is the documented "infinite"
    // sentinel (the battery is not discharging). It must become an explicit
    // null so Signal K clears any prior estimate, never a negative time. Only
    // -1 is special: 0 and other negatives scale normally, and a non-numeric
    // token is a garbled read that is skipped, leaving the last value intact.
    // Input "600" -> 36000 (s);  "0" -> 0;  "-2" -> -120;  "-1" -> null (clear);
    //       "-" -> undefined (skip)
    expect(convert('TTG', '600')).to.equal(36000)
    expect(convert('TTG', '0')).to.equal(0)
    expect(convert('TTG', '-2')).to.equal(-120)
    expect(convert('TTG', '-1')).to.equal(null)
    expect(convert('TTG', '-')).to.equal(undefined)
  })

  it('lowercases the load output state', () => {
    expect(convert('LOAD', 'OFF')).to.equal('off')
    expect(convert('LOAD', 'ON')).to.equal('on')
  })

  it('maps ALARM/RELAY on/off to 1/0', () => {
    expect(convert('ALARM', 'ON')).to.equal(1)
    expect(convert('ALARM', 'OFF')).to.equal(0)
    expect(convert('RELAY', 'on')).to.equal(1)
    expect(convert('RELAY', 'off')).to.equal(0)
  })

  it('scales AC output voltage (0.01 V units) and rejects NaN', () => {
    expect(convert('AC_OUT_V', '24000')).to.equal(240)
    expect(convert('AC_OUT_V', 'x')).to.equal(undefined)
  })

  it('scales AC output current (0.1 A units) and rejects NaN', () => {
    expect(convert('AC_OUT_I', '15')).to.equal(1.5)
    expect(convert('AC_OUT_I', 'x')).to.equal(undefined)
  })

  it('delegates enum fields to the parser decoders', () => {
    expect(convert('AR', '1')).to.equal('ALARM_REASON')
    expect(convert('ERR', '2')).to.equal('ERROR_STRING')
    expect(convert('CS', '4')).to.equal('STATE')
    expect(convert('MODE', '2')).to.equal('MODE_RESULT')
    expect(convert('MPPT', '2')).to.equal('TRACKER')
  })

  it('decodes PID into productId/productName side effects (with 0x prefix)', () => {
    const { ctx, sets } = makeContext()
    const result = convert('PID', '0xA053', ctx)
    expect(result, 'PID stores via set() and returns undefined').to.equal(
      undefined
    )
    expect(sets).to.have.lengthOf(2)
    expect(sets[0]).to.deep.equal({
      key: 'productId',
      value: { name: 'productId', value: '0xA053' }
    })
    expect(sets[1]).to.deep.equal({
      key: 'productName',
      value: { name: 'productId', value: 'PRODUCT_NAME' }
    })
  })

  it('prefixes a bare PID with 0x before lookup', () => {
    const { ctx, sets } = makeContext()
    convert('PID', '204', ctx)
    expect(sets[0]?.value.value).to.equal('0x204')
  })
})

describe('fields - static table', () => {
  // [name, path, unitId, units, type] for every field, with null for absent
  // optional members. Pinning the full table catches renames, path typos, and
  // mutated string/identifier literals in the field definitions.
  type Row = [
    string,
    string | null,
    string | null,
    string | null,
    string | null
  ]

  const EXPECTED: Record<string, Row> = {
    V: [
      'mainBattVoltage',
      'electrical.batteries.*.voltage',
      'mainBatt',
      'V',
      'metric'
    ],
    V2: [
      'auxBattVoltage',
      'electrical.batteries.*.voltage',
      'auxBatt',
      'V',
      'metric'
    ],
    V3: [
      'aux2BattVoltage',
      'electrical.batteries.*.voltage',
      'aux2Batt',
      'V',
      'metric'
    ],
    VS: [
      'auxBatteryVoltage',
      'electrical.batteries.*.voltage',
      'auxBatt',
      'V',
      'metric'
    ],
    VM: ['midPointVoltage', null, null, 'V', 'metric'],
    DM: ['midPointDeviation', null, null, null, 'ratio'],
    VPV: [
      'panelVoltage',
      'electrical.solar.*.panelVoltage',
      'solar',
      'V',
      'metric'
    ],
    PPV: [
      'panelPower',
      'electrical.solar.*.panelPower',
      'solar',
      'W',
      'metric'
    ],
    I: [
      'batteryCurrent',
      'electrical.batteries.*.current',
      'mainBatt',
      'A',
      'metric'
    ],
    I2: [
      'auxbatteryCurrent',
      'electrical.batteries.*.current',
      'auxBatt',
      'A',
      'metric'
    ],
    I3: [
      'aux2batteryCurrent',
      'electrical.batteries.*.current',
      'aux2Batt',
      'A',
      'metric'
    ],
    IL: [
      'loadCurrent',
      'electrical.solar.*.loadCurrent',
      'solar',
      'A',
      'metric'
    ],
    LOAD: ['loadOutputState', 'electrical.solar.*.load', 'solar', null, 'text'],
    T: [
      'batteryTemperature',
      'electrical.batteries.*.temperature',
      'mainBatt',
      'K',
      'metric'
    ],
    P: ['instantPower', null, null, 'W', 'metric'],
    CE: [
      'consumedAh',
      'electrical.batteries.*.capacity.consumedCharge',
      'mainBatt',
      'C',
      'metric'
    ],
    SOC: [
      'stateOfCharge',
      'electrical.batteries.*.capacity.stateOfCharge',
      'mainBatt',
      null,
      'ratio'
    ],
    TTG: [
      'timeToGo',
      'electrical.batteries.*.capacity.timeRemaining',
      'mainBatt',
      's',
      'metric'
    ],
    ALARM: ['alarm', null, null, null, 'boolean'],
    RELAY: ['relay', 'electrical.batteries.*.relay', 'bmv', null, 'boolean'],
    AR: ['alarmReason', null, null, null, 'text'],
    H1: ['depthOfDeepestDischarge', null, null, 'C', 'metric'],
    H2: ['depthOfLastDischarge', null, null, 'C', 'metric'],
    H3: ['depthOfAverageDischarge', null, null, 'C', 'metric'],
    H4: ['numberOfChargeCycles', null, null, null, 'count'],
    H5: ['numberOfFullDischarges', null, null, null, 'count'],
    H6: [
      'cumulativeAhDrawn',
      'electrical.batteries.*.lifetimeDischarge',
      'mainBatt',
      'C',
      'metric'
    ],
    H7: ['minimumMainBattVoltage', null, null, 'V', 'metric'],
    H8: ['maximumMainBattVoltage', null, null, 'V', 'metric'],
    H9: ['secondsSinceLastFullCharge', null, null, 's', 'metric'],
    H10: ['numberOfAutoSync', null, null, null, 'count'],
    H11: ['numberOfLowMainVoltageAlarms', null, null, null, 'count'],
    H12: ['numberOfHighMainVoltageAlarms', null, null, null, 'count'],
    H13: ['numberOfLowAuxVoltageAlarms', null, null, null, 'count'],
    H14: ['numberOfHighAuxVoltageAlarms', null, null, null, 'count'],
    H15: ['minimumAuxBattVoltage', null, null, 'V', 'metric'],
    H16: ['maximumAuxBattVoltage', null, null, 'V', 'metric'],
    H17: ['dischargedEnergy', null, null, 'J', 'metric'],
    H18: ['chargedEnergy', null, null, 'J', 'metric'],
    H19: [
      'yieldTotal',
      'electrical.solar.*.yieldTotal',
      'solar',
      'J',
      'metric'
    ],
    H20: [
      'yieldToday',
      'electrical.solar.*.yieldToday',
      'solar',
      'J',
      'metric'
    ],
    H21: [
      'maximumPowerToday',
      'electrical.solar.*.maximumPowerToday',
      'solar',
      'W',
      'metric'
    ],
    H22: [
      'yieldYesterday',
      'electrical.solar.*.yieldYesterday',
      'solar',
      'J',
      'metric'
    ],
    H23: [
      'maximumPowerYesterday',
      'electrical.solar.*.maximumPowerYesterday',
      'solar',
      'W',
      'metric'
    ],
    ERR: [
      'errorCode',
      'electrical.batteries.*.errorCode',
      'mainBatt',
      null,
      'text'
    ],
    CS: [
      'stateOfOperation',
      'electrical.charger.*.chargingMode',
      'mainBatt',
      null,
      'text'
    ],
    FW: ['firmwareVersion', null, null, null, 'text'],
    PID: ['productId', null, null, null, null],
    'SER#': ['serialNumber', null, null, null, 'text'],
    HSDS: ['daySequenceNumber', null, null, null, 'count'],
    MODE: ['deviceMode', null, null, null, 'text'],
    AC_OUT_V: [
      'acOutputVoltage',
      'electrical.ac.*.phase.A.lineLineVoltage',
      'inverter',
      'V',
      'metric'
    ],
    AC_OUT_I: [
      'acOutputCurrent',
      'electrical.ac.*.phase.A.current',
      'inverter',
      'A',
      'metric'
    ],
    WARN: ['warningReason', null, null, null, 'text'],
    BMV: ['batteryMonitorName', null, null, null, 'text'],
    MPPT: [
      'trackerOperationMode',
      'electrical.solar.*.trackerOperationMode',
      'solar',
      null,
      'text'
    ]
  }

  const rowOf = (f: Field): Row => [
    f.name,
    f.path ?? null,
    f.unitId ?? null,
    f.units ?? null,
    f.type ?? null
  ]

  it('contains exactly the expected field keys', () => {
    expect(Object.keys(fields).sort()).to.deep.equal(
      Object.keys(EXPECTED).sort()
    )
  })

  it('defines the expected name/path/unitId/units/type for every field', () => {
    for (const [key, expected] of Object.entries(EXPECTED)) {
      const field = fields[key]
      expect(field, `field ${key} missing`).to.not.equal(undefined)
      expect(rowOf(field!), `field ${key}`).to.deep.equal(expected)
    }
  })

  it('routes battery voltage and current to electrical.solar for a solar charger', () => {
    expect(fields.V!.solarCharger).to.deep.equal({
      path: 'electrical.solar.*.voltage',
      unitId: 'solar'
    })
    expect(fields.I!.solarCharger).to.deep.equal({
      path: 'electrical.solar.*.current',
      unitId: 'solar'
    })
  })
})
