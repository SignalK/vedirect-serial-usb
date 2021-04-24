const common = {
  number (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    return value
  },

  // 0.01 kWh
  kWh (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    // value is in units of 0.01 kWh each
    return value / 100
  },

  mV (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    return value / 1000
  },

  mA (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    return Math.floor(value / 10) / 100
  },

  mAh (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    return Math.floor(value / 10) / 100 * 3600
  },

  promille (value) {
    if (typeof value !== 'number') {
      value = parseInt(value, 10)
    }

    if (isNaN(value)) {
      return null
    }

    return value / 1000
  }
}

module.exports = {
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
    value (value) {
      value = value.toLowerCase()
      return value
    }
  },
  T: {
    name: 'batteryTemperature',
    path: 'electrical.batteries.*.temperature',
    unitId: 'mainBatt',
    units: 'K',
    type: 'metric',
    value (value, instance) {
      if (typeof value !== 'number') {
        value = parseInt(value, 10)
      }

      if (isNaN(value)) {
        return null
      }

      return (value + 273.15)
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
    value: value => {
      value = common.number(value)
      if (value === null) {
        return null
      }
      // value is minutes
      return value * 60
    },
    units: 's',
    type: 'metric'
  },
  ALARM: {
    name: 'alarm',
    type: 'boolean',
    value (value) {
      value = value.toUpperCase()
      return value === 'ON' ? 1 : 0
    }
  },
  RELAY: {
    name: 'relay',
    type: 'boolean',
    value (value) {
      value = value.toUpperCase()
      return value === 'ON' ? 1 : 0
    }
  },
  AR: {
    name: 'alarmReason',
    type: 'text',
    value (value, instance) {
      return instance.getAlarmReason(value)
    }
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
    value (value, instance) {
      return instance.getErrorString(value)
    }
  },
  CS: {
    name: 'stateOfOperation',
    path: 'electrical.charger.*.chargingMode',
    unitId: 'mainBatt',
    type: 'text',
    value (value, instance) {
      return instance.getStateOfOperation(value)
    }
  },
  FW: {
    name: 'firmwareVersion',
    type: 'text'
  },
  PID: {
    name: 'productId',
    value (value, instance) {
      value = String(value)
      if (!value.includes('0x')) {
        value = `0x${value}`
      }

      instance.set('productId', { name: 'productId', value })
      instance.set('productName', { name: 'productId', value: instance.getProductLongname(value) })
      return null
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
    value (value, instance) {
      return instance.getMode(value)
    }
  },
  AC_OUT_V: {
    name: 'acOutputVoltage',
    path: 'electrical.ac.*.phase.A.lineLineVoltage',
    unitId: 'inverter',
    units: 'V',
    type: 'metric',
    value (value, instance) {
      value = common.number(value)

      if (value === null) {
        return
      }

      // AC OUT V is reported in units of 0.01 V each.
      return value / 100
    }
  },
  AC_OUT_I: {
    name: 'acOutputCurrent',
    path: 'electrical.ac.*.phase.A.current',
    unitId: 'inverter',
    units: 'A',
    type: 'metric',
    value (value, instance) {
      value = common.number(value)

      if (value === null) {
        return
      }

      // AC OUT I is reported in units of 0.1 A each.
      return value / 10
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
    value (value, instance) {
      return instance.getTrackerOperationMode(value)
    }
  },
}
