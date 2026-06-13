/**
 * Shared types for the vedirect-serial-usb plugin.
 *
 * `SignalKApp` and `Plugin` are minimal structural descriptions of the
 * objects exchanged with the signalk-server host: only the members the
 * plugin actually uses are modelled.
 *
 * The `Field` / `FieldContext` / `StoredField` triple decouples the field
 * definition table (src/fields.ts) from the parser (src/Parser.ts). Field
 * value functions receive a `FieldContext` rather than the concrete parser
 * class, which keeps the two modules free of a runtime import cycle.
 */

/** Best-effort log sink. signalk-server passes `app.debug`; the standalone
 *  shim and the network modules use the same shape. */
export type DebugFn = (message: string) => void

/**
 * What kind of Victron device a connection talks to. VE.Direct reuses the
 * `V`/`I` labels for both battery monitors and solar chargers, so the device
 * type decides where those readings land (see `Field.solarCharger`). Treated as
 * a battery monitor when unset, which preserves the historical paths.
 */
export type DeviceType = 'Battery monitor' | 'Solar charger'

/** One VE.Direct connection as configured in the plugin schema. */
export interface VEDirectConnection {
  device: 'Serial' | 'UDP' | 'TCP'
  connection: string
  port: number
  deviceType?: DeviceType
  ignoreChecksum: boolean
  mainBatt: string
  auxBatt: string
  bmv: string
  solar: string
}

/**
 * Plugin options. The current schema uses the `vedirect[]` array; the flat
 * fields are the legacy single-connection format kept so that configs
 * written before the multi-connection rework still start (the in-memory
 * fallback in src/index.ts).
 */
export interface PluginOptions {
  vedirect?: VEDirectConnection[]
  device?: string
  host?: string
  udpPort?: number
  tcpPort?: number
  ignoreChecksum?: boolean
  mainBatt?: string
  auxBatt?: string
  bmv?: string
  solar?: string
  deviceType?: DeviceType
}

/** Flat single-connection configuration accepted by the standalone library
 *  wrapper (src/standalone.ts). */
export interface VEDirectConfig {
  device?: string
  connection?: string
  port?: number
  host?: string
  udpPort?: number
  tcpPort?: number
  ignoreChecksum?: boolean
  mainBatt?: string
  auxBatt?: string
  bmv?: string
  solar?: string
  deviceType?: DeviceType
}

/**
 * Result of a Signal K PUT action. A handler returns `COMPLETED` (with an
 * HTTP-like `statusCode`) to answer synchronously, or `PENDING` when it will
 * call the async callback later. This plugin only answers synchronously.
 */
export interface PutResult {
  state: 'COMPLETED' | 'PENDING'
  statusCode?: number
  message?: string
}

/**
 * Handler for a PUT request on a registered context/path. `value` is whatever
 * the requester sent (hence `unknown`; the handler narrows it). The trailing
 * callback is for `PENDING` async replies and is unused here.
 */
export type PutHandler = (
  context: string,
  path: string,
  value: unknown,
  callback: (result: PutResult) => void
) => PutResult | void

/** Minimal structural type for the `app` the signalk-server host passes to
 *  the plugin factory. */
export interface SignalKApp {
  handleMessage(id: string, delta: SKDelta): void
  debug: DebugFn
  /**
   * Registers a handler for PUT requests on `context`/`path`. Returns a
   * function that unregisters it again, which the plugin calls on `stop()` so a
   * config reload does not leave a stale handler writing to a closed port.
   */
  registerPutHandler(
    context: string,
    path: string,
    handler: PutHandler,
    source?: string
  ): () => void
}

/** Shape of the plugin object returned to the signalk-server host. */
export interface Plugin {
  id: string
  name: string
  description: string
  start(options: PluginOptions): void
  stop(): void
  schema: object
}

/** A Signal K delta message emitted for a parsed VE.Direct block.
 *
 * The source is carried as a `$source` ref string (`vedirect-signalk.<index>`)
 * rather than a structured `source` object: a `source.src` field would make
 * signalk-server misclassify the stream as NMEA 2000. See src/Parser.ts. */
export interface SKDelta {
  context: string
  updates: Array<{
    $source: string
    timestamp: string
    values: Array<{ path: string; value: number | string | null }>
  }>
}

/** Converts a raw VE.Direct token into a Signal K value. Receives the raw
 *  token and the parser (for cross-field lookups and enum decoding). Returns
 *  the value to store; `undefined` to skip the field, leaving any prior value
 *  untouched; or `null` to store an explicit null, which clears the value in
 *  Signal K (e.g. TTG -1, an infinite time-to-go). */
export type FieldValue = (
  value: string,
  instance: FieldContext
) => number | string | null | undefined

export type FieldType = 'metric' | 'ratio' | 'text' | 'boolean' | 'count'

/**
 * Identifies which configured device name fills a field path's `*` placeholder.
 * `mainBatt`/`auxBatt`/`bmv`/`solar` map to the per-connection config;
 * `aux2Batt`/`inverter` have no config slot and fall back to the parser's
 * `defaultUnitId`. Keeping this a union (rather than `string`) ties the field
 * table to the resolver in `getPath`: adding a new unit here forces the switch
 * there to handle it.
 */
export type UnitId =
  | 'mainBatt'
  | 'auxBatt'
  | 'aux2Batt'
  | 'bmv'
  | 'solar'
  | 'inverter'

/** A field definition: how to name, place and convert one VE.Direct token. */
export interface Field {
  name: string
  path?: string
  unitId?: UnitId
  /**
   * Alternative path and unit used when the connection is a solar charger.
   * VE.Direct sends battery-monitor and charger data under the same labels, but
   * a charger's reading describes its DC output, which belongs under
   * electrical.solar, not electrical.batteries where it would clash with a
   * monitor on the same bank.
   */
  solarCharger?: { path: string; unitId: UnitId }
  units?: string
  type?: FieldType
  value?: FieldValue
}

export type FieldMap = Record<string, Field>

/** A field whose `value` has been resolved to a concrete reading and stored
 *  on the parser. */
export interface StoredField {
  name: string
  value: number | string | null
  path?: string
  unitId?: UnitId
  units?: string
  type?: FieldType
}

/** The slice of the parser that field value functions are allowed to call.
 *  Implemented by VEDirectParser. */
export interface FieldContext {
  set(key: string, value: StoredField): void
  getAlarmReason(value: string | number): string | undefined
  getErrorString(value: string | number): string | undefined
  getStateOfOperation(value: string | number): string | undefined
  getMode(value: string | number): string | undefined
  getTrackerOperationMode(value: string | number): string | undefined
  getProductLongname(value: string): string
}
