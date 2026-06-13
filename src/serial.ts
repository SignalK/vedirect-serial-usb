/**
 * Serial (VE.Direct to USB) transport.
 *
 * Opens a serial port per connection index, splits the stream on `\r`
 * (VE.Direct line terminator) and feeds each line into the matching parser.
 * If the port closes unexpectedly (e.g. the USB cable is unplugged) it is
 * re-opened after a back-off, unless it was deliberately closed via `close()`
 * (which clears the slot and cancels any pending reconnect). Ports are tracked
 * by connection index so several connections can run side by side.
 */
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import type { VEDirectParser } from './Parser'
import type { DebugFn } from './types'

const BAUD_RATE = 19200
const RECONNECT_DELAY_MS = 10000

const port: (SerialPort | undefined)[] = []
const reconnectTimer: (ReturnType<typeof setTimeout> | undefined)[] = []

export function open(
  device: string,
  parser: VEDirectParser[],
  debug: DebugFn,
  connectionIndex: number
): void {
  closePort(connectionIndex)

  debug(`Serial: connecting to ${device}`)

  const sp = new SerialPort({ path: device, baudRate: BAUD_RATE })
  port[connectionIndex] = sp

  sp.on('open', () => {
    debug(`Connected to ${device}`)
  })

  sp.on('data', (chunk: Buffer) => {
    debug(`${chunk}`)
  })

  const parsed = sp.pipe(
    new DelimiterParser({ delimiter: '\r', includeDelimiter: true })
  )

  parsed.on('data', (chunk: Buffer) => {
    // Chunk is a node.js Buffer
    parser[connectionIndex]?.addChunk(chunk, connectionIndex)
    debug(`${chunk}`)
  })

  sp.on('error', (err: Error) => {
    debug(`SerialPort error on ${device}: ${err.message}`)
  })

  sp.on('close', () => {
    // Reconnect only if this is still the active port for the slot. A deliberate
    // close() clears the slot first, and a re-open replaces it, so in both cases
    // the stale port must not trigger a reconnect.
    if (port[connectionIndex] === sp) {
      debug(
        `Serial port ${device} closed; reconnecting in ${RECONNECT_DELAY_MS}ms`
      )
      reconnectTimer[connectionIndex] = setTimeout(() => {
        reconnectTimer[connectionIndex] = undefined
        open(device, parser, debug, connectionIndex)
      }, RECONNECT_DELAY_MS)
    }
  })
}

export function close(debug: DebugFn, connectionIndex: number): void {
  closePort(connectionIndex)
  debug('Serial port closed')
}

/**
 * Writes a raw command to a connection's serial port, used for outbound
 * VE.Direct HEX control frames (e.g. setting the BMV relay). Returns true only
 * when the port is open and the write was issued; false when no open port
 * exists for the index (including the gap while an unexpectedly-closed port
 * awaits reconnect) so the caller can report failure instead of assuming the
 * command reached the device.
 */
export function write(message: string, connectionIndex: number): boolean {
  const sp = port[connectionIndex]
  if (sp === undefined || !sp.isOpen) {
    return false
  }

  try {
    sp.write(message)
    // True means the write was issued, not flushed: serialport surfaces most
    // write failures asynchronously via the 'error' event, which this
    // synchronous boolean cannot reflect. The isOpen guard above covers the
    // common "port not open" case, which is the failure mode worth reporting.
    return true
  } catch {
    // The port can still drop between the isOpen check and the write; treat
    // that as a failed write rather than a thrown error to the PUT requester.
    return false
  }
}

// Cancels any pending reconnect and closes the active port for a slot. The slot
// is cleared before close() so the port's 'close' handler does not schedule a
// reconnect for a deliberate teardown.
function closePort(connectionIndex: number): void {
  const timer = reconnectTimer[connectionIndex]
  if (timer !== undefined) {
    clearTimeout(timer)
    reconnectTimer[connectionIndex] = undefined
  }

  const sp = port[connectionIndex]
  if (sp !== undefined) {
    port[connectionIndex] = undefined
    try {
      sp.close()
    } catch {
      // best-effort: the port may already be gone
    }
  }
}
