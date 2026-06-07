/**
 * Serial (VE.Direct to USB) transport.
 *
 * Opens a serial port per connection index, splits the stream on `\r`
 * (VE.Direct line terminator) and feeds each line into the matching parser.
 * Ports are tracked by `connectionIndex` (the connection index) so that several
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
  connectionIndex: number
): void {
  const existing = port[connectionIndex]
  if (existing !== undefined) {
    try {
      existing.close()
      port[connectionIndex] = undefined
    } catch {
      // best-effort: the port may already be gone
    }
  }

  debug(`Serial: connecting to ${device}`)

  const sp = new SerialPort({ path: device, baudRate: 19200 })
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
  delim[connectionIndex] = parsed

  parsed.on('data', (chunk: Buffer) => {
    // Chunk is a node.js Buffer
    parser[connectionIndex]?.addChunk(chunk, connectionIndex)
    debug(`${chunk}`)
  })

  sp.on('error', (err: Error) => {
    debug('SerialPort error: ' + err.message)
  })
}

export function close(debug: DebugFn, connectionIndex: number): void {
  const sp = port[connectionIndex]
  if (sp !== undefined) {
    try {
      sp.close()
      port[connectionIndex] = undefined
      debug('Serial port closed')
    } catch {
      // best-effort
    }
  }
}
