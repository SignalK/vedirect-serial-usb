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

/** One VE.Direct connection as configured in the plugin schema. */
export interface VEDirectConnection {
  device: 'Serial' | 'UDP' | 'TCP'
  connection: string
  port: number
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
}

/** Minimal structural type for the `app` the signalk-server host passes to
 *  the plugin factory. */
export interface SignalKApp {
  handleMessage(id: string, delta: SKDelta): void
  debug: DebugFn
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

/** A Signal K delta message emitted for a parsed VE.Direct block. */
export interface SKDelta {
  context: string
  updates: Array<{
    source: { label: string; type: string; src: string }
    timestamp: string
    values: Array<{ path: string; value: number | string }>
  }>
}

/** Converts a raw VE.Direct token into a Signal K value. Receives the raw
 *  token and the parser (for cross-field lookups and enum decoding), and
 *  returns the value to store, or null/undefined to skip it. */
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
  units?: string
  type?: FieldType
  value?: FieldValue
}

export type FieldMap = Record<string, Field>

/** A field whose `value` has been resolved to a concrete reading and stored
 *  on the parser. */
export interface StoredField {
  name: string
  value: number | string
  path?: string
  unitId?: UnitId
  units?: string
  type?: FieldType
}

/** The slice of the parser that field value functions are allowed to call.
 *  Implemented by VEDirectParser. */
export interface FieldContext {
  set(key: string, value: StoredField): void
  getAlarmReason(value: string | number): string | null
  getErrorString(value: string | number): string | null
  getStateOfOperation(value: string | number): string | null
  getMode(value: string | number): string | null
  getTrackerOperationMode(value: string | number): string | null
  getProductLongname(value: string): string
}
