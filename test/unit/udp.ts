/**
 * Unit tests for the UDP transport (src/udp.ts).
 *
 * `dgram` is a Node core module and cannot be swapped via the require cache, so
 * the transport is exercised against a real loopback socket: bind a free port,
 * send a datagram, assert it reaches the parser, then close. Everything stays on
 * 127.0.0.1 and the socket is closed in the same test, so nothing leaks.
 */
import { expect } from 'chai'
import * as dgram from 'dgram'
import * as udp from '../../src/udp'
import type { VEDirectParser } from '../../src/Parser'

/** Binds an ephemeral socket to learn a free UDP port, then frees it. Avoids a
 *  hard-coded port that could collide on a busy machine or CI runner. */
function freeUdpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = dgram.createSocket('udp4')
    probe.once('error', reject)
    probe.bind(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** Resolves once `done()` is true, resending `buf` every 25ms until then; the
 *  resend covers the gap between calling listen() and the bind completing. */
function sendUntil(
  sock: dgram.Socket,
  port: number,
  buf: Buffer,
  done: () => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const tick = (): void => {
      if (done()) return resolve()
      if (Date.now() - startedAt > 1500) {
        return reject(new Error('timed out waiting for datagram'))
      }
      sock.send(buf, port, '127.0.0.1')
      setTimeout(tick, 25)
    }
    tick()
  })
}

describe('udp transport', () => {
  it('binds a socket and forwards datagrams to the parser', async () => {
    const port = await freeUdpPort()
    const received: Array<{ data: Buffer; index: number }> = []
    const parser = [
      {
        addChunk: (data: Buffer, index: number) =>
          received.push({ data, index })
      }
    ] as unknown as VEDirectParser[]
    const logs: string[] = []
    const sender = dgram.createSocket('udp4')

    udp.listen(port, parser, (m) => logs.push(m), 0)
    try {
      await sendUntil(
        sender,
        port,
        Buffer.from('PID\t0x204\n'),
        () => received.length > 0
      )
    } finally {
      sender.close()
      udp.close((m) => logs.push(m), 0)
    }

    expect(received[0]?.data.toString()).to.equal('PID\t0x204\n')
    expect(received[0]?.index).to.equal(0)
    expect(logs.some((m) => m.includes(`listening on UDP ${port}`))).to.be.true
    expect(logs.some((m) => m.includes('UDP port closed'))).to.be.true
  })

  it('close() on an index with no socket is a no-op', () => {
    const logs: string[] = []
    expect(() => udp.close((m) => logs.push(m), 7)).to.not.throw()
    expect(logs).to.have.lengthOf(0)
  })
})
