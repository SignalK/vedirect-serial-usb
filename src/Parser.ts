/**
 * VE.Direct text-protocol parser.
 *
 * Accumulates raw bytes into blocks (terminated by the `Checksum` field),
 * verifies the block checksum (a running byte sum that must be 0 mod 256),
 * decodes each `label<TAB>value` line via the field table, and emits a Signal
 * K delta per valid block.
 *
 * Block layout on the wire (one field per line, `\r\n`-separated):
 *   "\r\nPID\t0xA053\r\nV\t12340\r\n...\r\nChecksum\t<byte>"
 */
import createDebug from 'debug'
import type { Debugger } from 'debug'
import { EventEmitter } from 'events'
import fields from './fields'
import { productIds } from './productIds'
import type {
  FieldContext,
  FieldMap,
  PluginOptions,
  SKDelta,
  StoredField,
  VEDirectConnection
} from './types'

/** Parser configuration after merging caller options with defaults. */
interface ParserOptions extends PluginOptions {
  productIds: Record<string, string>
  fields: FieldMap
  defaultUnitId: string
  mainBatt: string
  auxBatt: string
  bmv: string
  solar: string
  overrideUnitId?: string
}

const defaults = {
  productIds,
  fields,
  defaultUnitId: 'victronDevice',
  mainBatt: 'house',
  auxBatt: 'starter',
  bmv: 'bmv',
  solar: 'solar'
}

export class VEDirectParser extends EventEmitter implements FieldContext {
  options: ParserOptions
  fields: FieldMap
  debug: Debugger
  line: string[]
  data: Record<string, StoredField>
  cache: string
  sum: number

  constructor(opts?: PluginOptions) {
    super()
    this.options = Object.assign({}, defaults, opts || {}) as ParserOptions
    this.fields = this.options.fields
    this.debug = createDebug('signalk-vedirect-parser')
    this.line = []
    this.data = {}
    this.cache = ''
    this.sum = 0
  }

  addChunk(buf: Buffer, items: number): void {
    if (!Buffer.isBuffer(buf)) {
      this.warn('addChunk: incoming data is not a buffer: ' + typeof buf)
      return
    }

    const chunk = buf.toString('ascii')

    buf.forEach((b) => {
      this.sum += b
    })

    this.cache += chunk
    if (chunk.toLowerCase().includes('checksum')) {
      // Last line of block. Verify checksum of block in cache and parse
      // line-by-line if checksum is correct.
      this._verifyCacheAndParse(items)
    }
  }

  parse(line: string): void {
    if (typeof line !== 'string') {
      return
    }
    this.line = line.trim().split('\t')
    this._parse()
  }

  set(key: string, value: StoredField): void {
    this.data[key] = value
    this.emit('change', Object.assign({}, this.data))
    this.emit('set', { key, value })
  }

  get(key: string): StoredField | undefined {
    return this.data[key]
  }

  unset(key: string): void {
    if (!Object.prototype.hasOwnProperty.call(this.data, key)) {
      return
    }

    this.debug(`Unsetting ${key}`)
    this.emit('change', Object.assign({}, this.data))
    this.emit('unset', key)

    delete this.data[key]
  }

  getData(): Record<string, StoredField> {
    return Object.assign({}, this.data)
  }

  private _verifyCacheAndParse(items: number): void {
    const conn = this.options.vedirect?.[items]

    // Verify checksum unless ignoreChecksum is explicitly true.
    if (conn?.ignoreChecksum !== true && this.sum % 256 !== 0) {
      this.warn(`block checksum doesn't equal 0: ${this.sum % 256}`)
      this.cache = ''
      this.sum = 0
      return
    }

    this.cache
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .forEach((line) => {
        this.line = line.split('\t')
        this._parse()
      })

    this.cache = ''
    this.sum = 0
    this.generateDelta(items)
  }

  private _parse(): void {
    if (!Array.isArray(this.line) || this.line.length !== 2) {
      this.warn(
        '_parse() called on invalid line: ' +
          JSON.stringify({ line: this.line })
      )
      return
    }

    const rawKey = this.line[0]
    const rawData = this.line[1]

    if (rawKey === undefined || rawData === undefined) {
      this.warn('Data is NULL, ignoring')
      return
    }

    const fieldKey = String(rawKey).toUpperCase()
    const field = this.fields[fieldKey]

    if (!field || typeof field !== 'object') {
      this.warn(`No field definition for: ${fieldKey}, ignoring`)
      return
    }

    const converted =
      typeof field.value === 'function' ? field.value(rawData, this) : rawData

    if (typeof converted !== 'undefined' && converted !== null) {
      this.set(field.name, { ...field, value: converted })
    }
  }

  getAlarmReason(alarmReason: string | number): string | null {
    switch (parseInt(String(alarmReason), 10)) {
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

  getErrorString(err: string | number): string | null {
    switch (parseInt(String(err), 10)) {
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

  getMode(mode: string | number): string | null {
    switch (parseInt(String(mode), 10)) {
      case 2:
        return 'on'

      case 4:
        return 'off'

      case 5:
        return 'eco'

      default:
        return null
    }
  }

  getStateOfOperation(cs: string | number): string | null {
    switch (parseInt(String(cs), 10)) {
      case 0:
        return 'off'

      case 1:
        return 'low power'

      case 2:
        return 'fault'

      case 3:
        return 'bulk'

      case 4:
        return 'absorption'

      case 5:
        return 'float'

      case 9:
        return 'inverting'

      default:
        return null
    }
  }

  getTrackerOperationMode(mppt: string | number): string | null {
    switch (parseInt(String(mppt), 10)) {
      case 0:
        return 'off'

      case 1:
        return 'voltage or current limited'

      case 2:
        return 'mpp tracker active'

      default:
        return null
    }
  }

  getProductLongname(pid: string): string {
    let key = String(pid)

    if (!key.includes('0x')) {
      key = `0x${key}`
    }

    return this.options.productIds[key] ?? 'Unknown'
  }

  generateDelta(items: number): void {
    const values = Object.keys(this.data)
      .map((name) => {
        const path = this.getPath(name, items)
        const entry = this.data[name]
        if (path === null || entry === undefined) {
          return null
        }
        return { path, value: entry.value }
      })
      .filter(
        (update): update is { path: string; value: number | string } =>
          update !== null
      )

    if (values.length === 0) {
      this.warn('No mutations in this delta')
      return
    }

    const delta: SKDelta = {
      context: 'vessels.self',
      updates: [
        {
          source: {
            label: '@signalk/vedirect-serial-usb',
            type: 'VE.direct'
          },
          timestamp: new Date().toISOString(),
          values
        }
      ]
    }

    this.emit('delta', delta)
  }

  getPath(name: string, items: number): string | null {
    const conn: VEDirectConnection | undefined = this.options.vedirect?.[items]

    return Object.keys(this.fields).reduce<string | null>((found, key) => {
      const field = this.fields[key]
      if (!field || field.name !== name || field.path === undefined) {
        return found
      }

      let path = field.path

      if (field.unitId !== undefined) {
        let unitID = ''

        if (conn) {
          if (field.unitId === 'mainBatt') {
            unitID = conn.mainBatt
          } else if (field.unitId === 'auxBatt') {
            unitID = conn.auxBatt
          } else if (field.unitId === 'bmv') {
            unitID = conn.bmv
          } else if (field.unitId === 'solar') {
            unitID = conn.solar
          }
        }

        if (!unitID && typeof this.options.defaultUnitId === 'string') {
          unitID = this.options.defaultUnitId
        }

        if (typeof this.options.overrideUnitId === 'string') {
          unitID = this.options.overrideUnitId
        }

        path = path.replace('*', unitID)
      }

      return path
    }, null)
  }

  warn(message: string): void {
    this.debug(`Warning: ${message}`)
    this.emit('warn', message)
  }

  error(err: Error): void {
    this.debug(`Error: ${err.message}`)
    this.emit('error', err)
  }
}

export default VEDirectParser
