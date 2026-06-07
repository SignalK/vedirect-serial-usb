/**
 * Plugin-wide constants.
 */

// The plugin id. signalk-server receives it as the provider id (the first
// argument to app.handleMessage), and the parser reuses it to namespace the
// per-connection Signal K source ref it stamps on each delta
// (`vedirect-signalk.0`, `vedirect-signalk.1`, ...). Both src/index.ts and
// src/Parser.ts need it; index.ts uses `export =` and so cannot re-export a
// named const, hence this shared module keeps the two from drifting apart.
export const PLUGIN_ID = 'vedirect-signalk'
