/**
 * TCP transport.
 *
 * Connects to a host:port that bridges a remote VE.Direct device onto the
 * network and feeds the received bytes into the matching parser. On close the
 * socket is re-dialled after a back-off, unless it was deliberately closed via
 * `close()` (which clears the slot so no reconnect is scheduled).
 */
import * as Net from 'net'
import type { VEDirectParser } from './Parser'
import type { DebugFn } from './types'

const RECONNECT_DELAY_MS = 10000
const SOCKET_TIMEOUT_MS = 5000

const client: (Net.Socket | undefined)[] = []

function makeConnection(
  host: string,
  port: number,
  debug: DebugFn,
  items: number
): Net.Socket {
  const socket = new Net.Socket()
  socket.connect({ port, host })
  socket.setTimeout(SOCKET_TIMEOUT_MS)
  debug(`Connection to ${host}:${port}`)
  client[items] = socket
  return socket
}

function onData(
  msg: Buffer,
  parser: VEDirectParser[],
  debug: DebugFn,
  items: number
): void {
  parser[items]?.addChunk(msg, items)
  debug(`${msg}`)
}

function onClose(
  host: string,
  port: number,
  parser: VEDirectParser[],
  debug: DebugFn,
  items: number
): void {
  // Only reconnect if the slot is still active (not cleared by close()).
  if (client[items] !== undefined) {
    setTimeout(() => {
      debug('Trying to reconnect')
      connect(host, port, parser, debug, items)
    }, RECONNECT_DELAY_MS)
  }
}

export function connect(
  host: string,
  port: number,
  parser: VEDirectParser[],
  debug: DebugFn,
  items: number
): void {
  const socket = makeConnection(host, port, debug, items)

  socket.on('data', (msg: Buffer) => {
    onData(msg, parser, debug, items)
  })

  socket.on('close', () => {
    debug('TCP connection closed')
    socket.destroy()
    onClose(host, port, parser, debug, items)
  })

  socket.on('error', () => {
    debug('TCP connection error')
    socket.destroy()
  })

  socket.on('timeout', () => {
    debug('TCP connection timeout')
    socket.destroy()
  })
}

export function close(debug: DebugFn, items: number): void {
  const socket = client[items]
  if (socket !== undefined) {
    client[items] = undefined
    socket.destroy()
    debug('TCP port closed')
  }
}
