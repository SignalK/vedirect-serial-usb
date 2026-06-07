/**
 * VE.Direct field definitions.
 *
 * Maps each VE.Direct text-protocol label (e.g. `V`, `SOC`, `PID`) to how it
 * is named, where it lands in the Signal K tree (`path`, with `*` replaced by
 * the configured unit id) and how its raw token is converted. A field with no
 * `value` function stores the raw string. A `value` function returns the value
 * to store, `undefined` to skip the field (leaving any prior value untouched),
 * or `null` to store an explicit null that clears the value in Signal K.
 */
import type { FieldMap } from './types'

/** Numeric converters shared across fields. Each accepts the raw token (a
 *  string from the wire, occasionally an already-numeric value) and returns
 *  the scaled number, or undefined when the token is not a number (skip). */
const common = {
  number(value: string | number): number | undefined {
    const n = typeof value === 'number' ? value : parseInt(value, 10)
    return isNaN(n) ? undefined : n
  },

  // value is in units of 0.01 kWh each
  kWh(value: string | number): number | undefined {
    const n = common.number(value)
    return n === undefined ? undefined : n / 100
  },

  mV(value: string | number): number | undefined {
    const n = common.number(value)
    return n === undefined ? undefined : n / 1000
  },

  mA(value: string | number): number | undefined {
    const n = common.number(value)
    return n === undefined ? undefined : Math.floor(n / 10) / 100
  },

  mAh(value: string | number): number | undefined {
    const n = common.number(value)
    return n === undefined ? undefined : (Math.floor(n / 10) / 100) * 3600
  },

  promille(value: string | number): number | undefined {
    const n = common.number(value)
    return n === undefined ? undefined : n / 1000
  }
}

const fields: FieldMap = {
  V: {
    name: 'mainBattVoltage',
    path: 'electrical.batteries.*.voltage',
    unitId: 'mainBatt',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  V2: {
    name: 'auxBattVoltage',
    path: 'electrical.batteries.*.voltage',
    unitId: 'auxBatt',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  V3: {
    name: 'aux2BattVoltage',
    path: 'electrical.batteries.*.voltage',
    unitId: 'aux2Batt',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  VS: {
    name: 'auxBatteryVoltage',
    path: 'electrical.batteries.*.voltage',
    unitId: 'auxBatt',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  VM: {
    name: 'midPointVoltage',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  DM: {
    name: 'midPointDeviation',
    value: common.promille,
    type: 'ratio'
  },
  VPV: {
    name: 'panelVoltage',
    path: 'electrical.solar.*.panelVoltage',
    unitId: 'solar',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  PPV: {
    name: 'panelPower',
    path: 'electrical.solar.*.panelPower',
    unitId: 'solar',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  I: {
    name: 'batteryCurrent',
    path: 'electrical.batteries.*.current',
    unitId: 'mainBatt',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  I2: {
    name: 'auxbatteryCurrent',
    path: 'electrical.batteries.*.current',
    unitId: 'auxBatt',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  I3: {
    name: 'aux2batteryCurrent',
    path: 'electrical.batteries.*.current',
    unitId: 'aux2Batt',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  IL: {
    name: 'loadCurrent',
    path: 'electrical.solar.*.loadCurrent',
    unitId: 'solar',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  LOAD: {
    name: 'loadOutputState',
    path: 'electrical.solar.*.load',
    unitId: 'solar',
    type: 'text',
    value: (value) => value.toLowerCase()
  },
  T: {
    name: 'batteryTemperature',
    path: 'electrical.batteries.*.temperature',
    unitId: 'mainBatt',
    units: 'K',
    type: 'metric',
    value: (value) => {
      const n = common.number(value)
      return n === undefined ? undefined : n + 273.15
    }
  },
  P: {
    name: 'instantPower',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  CE: {
    name: 'consumedAh',
    path: 'electrical.batteries.*.capacity.consumedCharge',
    unitId: 'mainBatt',
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  SOC: {
    name: 'stateOfCharge',
    path: 'electrical.batteries.*.capacity.stateOfCharge',
    unitId: 'mainBatt',
    value: common.promille,
    type: 'ratio'
  },
  TTG: {
    name: 'timeToGo',
    path: 'electrical.batteries.*.capacity.timeRemaining',
    unitId: 'mainBatt',
    // Time-to-go is reported in minutes. -1 is the documented "infinite"
    // sentinel (the battery is not discharging); it becomes an explicit null so
    // Signal K clears any prior estimate rather than showing a negative time. A
    // non-numeric token is a garbled read and is skipped, leaving the last value.
    // Input "600" -> 36000 (s);  "-1" -> null (clear);  "-" -> undefined (skip)
    value: (value) => {
      const n = common.number(value)
      if (n === undefined) {
        return undefined
      }
      return n === -1 ? null : n * 60
    },
    units: 's',
    type: 'metric'
  },
  ALARM: {
    name: 'alarm',
    type: 'boolean',
    value: (value) => (value.toUpperCase() === 'ON' ? 1 : 0)
  },
  RELAY: {
    name: 'relay',
    type: 'boolean',
    path: 'electrical.batteries.*.relay',
    unitId: 'bmv',
    value: (value) => (value.toUpperCase() === 'ON' ? 1 : 0)
  },
  AR: {
    name: 'alarmReason',
    type: 'text',
    value: (value, instance) => instance.getAlarmReason(value)
  },
  H1: {
    name: 'depthOfDeepestDischarge',
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  H2: {
    name: 'depthOfLastDischarge',
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  H3: {
    name: 'depthOfAverageDischarge',
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  H4: {
    name: 'numberOfChargeCycles',
    value: common.number,
    type: 'count'
  },
  H5: {
    name: 'numberOfFullDischarges',
    value: common.number,
    type: 'count'
  },
  H6: {
    name: 'cumulativeAhDrawn',
    path: 'electrical.batteries.*.lifetimeDischarge',
    unitId: 'mainBatt',
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  H7: {
    name: 'minimumMainBattVoltage',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  H8: {
    name: 'maximumMainBattVoltage',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  H9: {
    name: 'secondsSinceLastFullCharge',
    value: common.number,
    units: 's',
    type: 'metric'
  },
  H10: {
    name: 'numberOfAutoSync',
    value: common.number,
    type: 'count'
  },
  H11: {
    name: 'numberOfLowMainVoltageAlarms',
    value: common.number,
    type: 'count'
  },
  H12: {
    name: 'numberOfHighMainVoltageAlarms',
    value: common.number,
    type: 'count'
  },
  H13: {
    name: 'numberOfLowAuxVoltageAlarms',
    value: common.number,
    type: 'count'
  },
  H14: {
    name: 'numberOfHighAuxVoltageAlarms',
    value: common.number,
    type: 'count'
  },
  H15: {
    name: 'minimumAuxBattVoltage',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  H16: {
    name: 'maximumAuxBattVoltage',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  H17: {
    name: 'dischargedEnergy',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H18: {
    name: 'chargedEnergy',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H19: {
    name: 'yieldTotal',
    path: 'electrical.solar.*.yieldTotal',
    unitId: 'solar',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H20: {
    name: 'yieldToday',
    path: 'electrical.solar.*.yieldToday',
    unitId: 'solar',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H21: {
    name: 'maximumPowerToday',
    path: 'electrical.solar.*.maximumPowerToday',
    unitId: 'solar',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  H22: {
    name: 'yieldYesterday',
    path: 'electrical.solar.*.yieldYesterday',
    unitId: 'solar',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H23: {
    name: 'maximumPowerYesterday',
    path: 'electrical.solar.*.maximumPowerYesterday',
    unitId: 'solar',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  ERR: {
    name: 'errorCode',
    path: 'electrical.batteries.*.errorCode',
    unitId: 'mainBatt',
    type: 'text',
    value: (value, instance) => instance.getErrorString(value)
  },
  CS: {
    name: 'stateOfOperation',
    path: 'electrical.charger.*.chargingMode',
    unitId: 'mainBatt',
    type: 'text',
    value: (value, instance) => instance.getStateOfOperation(value)
  },
  FW: {
    name: 'firmwareVersion',
    type: 'text'
  },
  PID: {
    name: 'productId',
    value: (value, instance) => {
      let pid = String(value)
      if (!pid.includes('0x')) {
        pid = `0x${pid}`
      }

      instance.set('productId', { name: 'productId', value: pid })
      instance.set('productName', {
        name: 'productId',
        value: instance.getProductLongname(pid)
      })
      return undefined
    }
  },
  'SER#': {
    name: 'serialNumber',
    type: 'text'
  },
  HSDS: {
    name: 'daySequenceNumber',
    value: common.number,
    type: 'count'
  },
  MODE: {
    name: 'deviceMode',
    type: 'text',
    value: (value, instance) => instance.getMode(value)
  },
  AC_OUT_V: {
    name: 'acOutputVoltage',
    path: 'electrical.ac.*.phase.A.lineLineVoltage',
    unitId: 'inverter',
    units: 'V',
    type: 'metric',
    value: (value) => {
      const n = common.number(value)
      // AC OUT V is reported in units of 0.01 V each.
      return n === undefined ? undefined : n / 100
    }
  },
  AC_OUT_I: {
    name: 'acOutputCurrent',
    path: 'electrical.ac.*.phase.A.current',
    unitId: 'inverter',
    units: 'A',
    type: 'metric',
    value: (value) => {
      const n = common.number(value)
      // AC OUT I is reported in units of 0.1 A each.
      return n === undefined ? undefined : n / 10
    }
  },
  WARN: {
    name: 'warningReason',
    type: 'text'
  },
  BMV: {
    name: 'batteryMonitorName',
    type: 'text'
  },
  MPPT: {
    name: 'trackerOperationMode',
    path: 'electrical.solar.*.trackerOperationMode',
    unitId: 'solar',
    type: 'text',
    value: (value, instance) => instance.getTrackerOperationMode(value)
  }
}

export default fields
