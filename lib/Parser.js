const debug = require('debug')
const EventEmitter = require('events')

const defaults = {
  productIds: require('./productIds.json'),
  fields: require('./fields')
}

class VEDirectParser extends EventEmitter {
  constructor (opts) {
    super()
    this.options = Object.assign({}, defaults, opts || {})
    this.fields = this.options.fields
    this.debug = debug('signalk-vedirect-parser')
    this.line = []
    this.data = {}
    this.cache = ''
  }

  addChunk (chunk) {
    if (typeof chunk !== 'string') {
      return
    }

    this.cache += chunk
    if (chunk.toLowerCase().includes('checksum')) {
      // Last line of block. Verify checksum of block in cache and parse line-by-line if checksum is correct.
      this._verifyCacheAndParse()
    }
  }

  parse (line) {
    if (typeof line !== 'string') {
      return
    }
    this.line = line.trim().split('\t')
    this._parse()
  }

  set (key, value) {
    this.data[key] = value
    this.emit('change', Object.assign({}, this.data))
    this.emit('set', { key, value })
  }

  get (key) {
    return this.data[key]
  }

  unset (key) {
    if (!this.data.hasOwnProperty(key)) {
      return
    }

    this.debug(`Unsetting ${key}`)
    this.emit('change', Object.assign({}, this.data))
    this.emit('unset', key)

    this.data[key] = null
    delete this.data[key]
  }

  getData () {
    return Object.assign({}, this.data)
  }

  _verifyCacheAndParse () {
    let sum = 0
    let i = this.cache.length
    while (i--) {
      sum += this.cache.charCodeAt(i)
    }

    if (sum % 265 !== 0) {
      this.cache = ''
      this.warn(`block checksum doesn't equal 0: ${sum % 256}`)
      return
    }

    this.cache
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '')
      .forEach(line => {
        this.line = line.split('\n')
        this._parse()
      })

    this.emit('parsed', Object.assign({}, this.data))
  }

  _parse () {
    let field = null
    let data = null
    let converted = null

    if (!Array.isArray(this.line) || this.line.length !== 2) {
      return this.warn('_parse() called on invalid line: ' + JSON.stringify({ line: this.line }))
    }

    field = String(this.line[0]).toUpperCase()

    if (!Object.keys(this.fields).includes(field) || typeof this.fields[field] !== 'object' || this.fields[field] === null) {
      return this.warn(`No field definition for: ${field}, ignoring`)
    }

    field = this.fields[field]
    data = this.line[1]

    if (data === undefined || data === null) {
      return this.warn(`Data is NULL, ignoring`)
    }

    if (typeof field.value === 'function') {
      converted = field.value(data, this)
    } else {
      converted = data
    }

    if (typeof converted !== 'undefined' && converted !== null) {
      this.set(field.name, Object.assign({}, field, {
        value: converted
      }))
    }
  }

  getAlarmReason (alarmReason) {
    alarmReason = parseInt(alarmReason, 10)

    switch (alarmReason) {
      case 1:
        return 'Low voltage'

      case 2:
        return 'High voltage'

      case 4:
        return 'Low state-of-charge'

      case 8:
        return 'Low starter voltage'

      case 16:
        return 'High starter voltage'

      case 32:
        return 'Low temperature'

      case 64:
        return 'High temperature'

      case 128:
        return 'Mid voltage'

      case 256:
        return 'Overload'

      case 512:
        return 'DC ripple'

      case 1024:
        return 'Low V AC out'

      case 2048:
        return 'High V AC out'

      default:
        return null
    }
  }

  getErrorString (err) {
    err = parseInt(err, 10)

    switch (err) {
      case 2:
        return 'Battery voltage too high'

      case 17:
        return 'Charger temperature too high'

      case 18:
        return 'Charger overcurrent'

      // Can be ignored according to victron protocol
      // case 19:
      //   return 'Charger current reversed'

      case 20:
        return 'Bulk time limit exceeded'

      // Can be ignored according to victron protocol
      // case 21:
      //   return 'Current sensor issue (sensor bias/sensor broken)'

      case 26:
        return 'Terminals overheated'

      case 33:
        return 'Input voltage too high (solar panel)'

      case 34:
        return 'Input current too high (solar panel)'

      case 38:
        return 'Input shutdown (due to excessive battery voltage)'

      case 116:
        return 'Factory calibration data lost'

      case 117:
        return 'Invalid/incompatible firmware'

      case 119:
        return 'User settings invalid'

      default:
        return null
    }
  }

  getMode (mode) {
    mode = parseInt(mode, 10)

    switch (mode) {
      case 2:
        return 'VE_REG_MODE_INVERTER'

      case 4:
        return 'VE_REG_MODE_OFF'

      case 5:
        return 'VE_REG_MODE_ECO'

      default:
        return null
    }
  }

  getStateOfOperation (cs) {
    cs = parseInt(cs, 10)

    switch (cs) {
      case 0:
        return 'Off'

      case 1:
        return 'Low power'

      case 2:
        return 'Fault'

      case 3:
        return 'Bulk'

      case 4:
        return 'Absorption'

      case 5:
        return 'Float'

      case 9:
        return 'Inverting'

      default:
        return null
    }
  }

  getProductLongname (pid) {
    pid = String(pid)

    if (!pid.includes('0x')) {
      pid = `0x${pid}`
    }

    if (!Object.keys(this.options.productIds).includes(pid)) {
      return 'Unknown'
    }

    return this.options.productIds[pid]
  }

  warn (message) {
    this.debug(`Warning: ${message}`)
    this.emit('warn', message)
  }

  error (err) {
    this.debug(`Error: ${err.message}`)
    this.emit('error', err)
  }
}

module.exports = VEDirectParser
