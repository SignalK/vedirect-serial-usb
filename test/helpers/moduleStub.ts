/**
 * CommonJS module stubbing for unit tests.
 *
 * The transport modules (serial) and the plugin entry point (index) pull in
 * heavy or side-effectful dependencies - real serial ports, or the plugin's own
 * transports. Because everything runs as CommonJS under tsx, a unit test can
 * load the module under test with those dependencies swapped out by seeding the
 * require cache before a fresh load and restoring it afterwards. No external
 * mocking library is required.
 *
 * Only npm packages and local project modules can be stubbed this way; Node
 * core modules (net, dgram) bypass the require cache, so the transports built
 * on them (tcp, udp) are exercised against real localhost sockets instead.
 */
import { createRequire } from 'module'
import { isAbsolute, resolve } from 'path'

const req = createRequire(__filename)
const repoRoot = resolve(__dirname, '..', '..')

// A project module is given relative to the repo root (e.g. "src/serial");
// anything else is treated as an npm package specifier (e.g. "serialport").
function resolveId(spec: string): string {
  const local = spec.startsWith('src/') || spec.startsWith('src\\')
  return req.resolve(local || isAbsolute(spec) ? resolve(repoRoot, spec) : spec)
}

/**
 * Loads `modulePath` (repo-root relative, e.g. "src/index") with `stubs`
 * injected for the listed dependency specifiers, then restores the prior
 * require-cache state. The returned instance keeps the stubs it captured at
 * load time; imports elsewhere get the real modules again.
 *
 * Each stub value becomes that module's `module.exports`, so pass an object of
 * named exports (e.g. `{ open, close }`) or a single value for an `export =`
 * module (e.g. a plugin factory function).
 *
 * `evict` lists further modules to reload from scratch (without replacing them)
 * so an intermediate real module re-captures the stubs - e.g. evict "src/index"
 * when stubbing the transports it imports, so a fresh index picks up the fakes.
 */
export function requireFresh<T>(
  modulePath: string,
  stubs: Record<string, unknown> = {},
  evict: string[] = []
): T {
  const targetId = resolveId(modulePath)
  const saved = new Map<string, NodeModule | undefined>()

  const swap = (id: string, mod: NodeModule | undefined): void => {
    if (!saved.has(id)) {
      saved.set(id, req.cache[id])
    }
    if (mod === undefined) delete req.cache[id]
    else req.cache[id] = mod
  }

  // Force a fresh evaluation of the module under test and any intermediates,
  // then inject the stubs.
  swap(targetId, undefined)
  for (const spec of evict) {
    swap(resolveId(spec), undefined)
  }
  for (const [spec, exportsValue] of Object.entries(stubs)) {
    const id = resolveId(spec)
    swap(id, {
      id,
      filename: id,
      loaded: true,
      exports: exportsValue
    } as NodeModule)
  }

  try {
    return req(targetId) as T
  } finally {
    for (const [id, mod] of saved) {
      if (mod === undefined) delete req.cache[id]
      else req.cache[id] = mod
    }
  }
}
