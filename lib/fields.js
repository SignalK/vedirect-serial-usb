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
    return value * 10 * 3600000
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
    unit: 'mainBatt',
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  VS: {
    name: 'auxBatteryVoltage',
    path: 'electrical.batteries.*.voltage',
    unit: 'auxBatt',
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
    value: common.mV,
    units: 'V',
    type: 'metric'
  },
  PPV: {
    name: 'panelPower',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  I: {
    name: 'batteryCurrent',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  IL: {
    name: 'loadCurrent',
    value: common.mA,
    units: 'A',
    type: 'metric'
  },
  LOAD: {
    name: 'loadOutputState',
    type: 'text'
  },
  T: {
    name: 'batteryTemperature',
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
    value: common.mAh,
    units: 'C',
    type: 'metric'
  },
  SOC: {
    name: 'stateOfCharge',
    value: common.promille,
    type: 'ratio'
  },
  TTG: {
    name: 'timeToGo',
    value: value => {
      value = common.number(value)
      if (value === null) {
        return null
      }
      // value is minutes
      return value / 60
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
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H20: {
    name: 'yieldToday',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H21: {
    name: 'maximumPowerToday',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  H22: {
    name: 'yieldYesterday',
    value: common.kWh,
    units: 'J',
    type: 'metric'
  },
  H23: {
    name: 'maximumPowerYesterday',
    value: common.number,
    units: 'W',
    type: 'metric'
  },
  ERR: {
    name: 'errorCode',
    type: 'text',
    value (value, instance) {
      instance.set('error', {
        name: 'error',
        value: instance.getErrorString(value)
      })

      instance.set('errorCode', {
        name: 'errorCode',
        value
      })

      return null
    }
  },
  CS: {
    name: 'stateOfOperation',
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
  }
}
