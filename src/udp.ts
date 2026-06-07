/**
 * UDP transport.
 *
 * Binds a UDP socket per connection index and feeds each received datagram
 * into the matching parser. Used when a bridge forwards a remote VE.Direct
 * device's serial data as UDP packets.
 */
import * as dgram from 'dgram'
import type { VEDirectParser } from './Parser'
import type { DebugFn } from './types'

const socket: (dgram.Socket | undefined)[] = []

export function listen(
  port: number,
  parser: VEDirectParser[],
  debug: DebugFn,
  items: number
): void {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true })
  socket[items] = sock

  sock.on('listening', () => {
    debug(`listening on UDP ${port}`)
  })

  sock.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    debug(`${rinfo.address}:${rinfo.port}:${msg}`)
    parser[items]?.addChunk(msg, items)
  })

  sock.bind(port)
}

export function close(debug: DebugFn, items: number): void {
  const sock = socket[items]
  if (sock !== undefined) {
    sock.close()
    socket[items] = undefined
    debug('UDP port closed')
  }
}
