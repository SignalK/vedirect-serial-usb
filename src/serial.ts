/**
 * Serial (VE.Direct to USB) transport.
 *
 * Opens a serial port per connection index, splits the stream on `\r`
 * (VE.Direct line terminator) and feeds each line into the matching parser.
 * Ports are tracked by `items` (the connection index) so that several
 * configured connections can run side by side.
 */
import { SerialPort } from 'serialport'
import { DelimiterParser } from '@serialport/parser-delimiter'
import type { VEDirectParser } from './Parser'
import type { DebugFn } from './types'

const port: (SerialPort | undefined)[] = []
const delim: (DelimiterParser | undefined)[] = []

export function open(
  device: string,
  parser: VEDirectParser[],
  debug: DebugFn,
  items: number
): void {
  const existing = port[items]
  if (existing !== undefined) {
    try {
      existing.close()
      port[items] = undefined
    } catch {
      // best-effort: the port may already be gone
    }
  }

  debug(`Serial: connecting to ${device}`)

  const sp = new SerialPort({ path: device, baudRate: 19200 })
  port[items] = sp

  sp.on('open', () => {
    debug(`Connected to ${device}`)
  })

  sp.on('data', (chunk: Buffer) => {
    debug(`${chunk}`)
  })

  const parsed = sp.pipe(
    new DelimiterParser({ delimiter: '\r', includeDelimiter: true })
  )
  delim[items] = parsed

  parsed.on('data', (chunk: Buffer) => {
    // Chunk is a node.js Buffer
    parser[items]?.addChunk(chunk, items)
    debug(`${chunk}`)
  })

  sp.on('error', (err: Error) => {
    debug('SerialPort error: ' + err.message)
  })
}

export function close(debug: DebugFn, items: number): void {
  const sp = port[items]
  if (sp !== undefined) {
    try {
      sp.close()
      port[items] = undefined
      debug('Serial port closed')
    } catch {
      // best-effort
    }
  }
}
