/**
 * Unit tests for the TCP transport (src/tcp.ts).
 *
 * `net` is a Node core module and cannot be swapped via the require cache, so
 * the transport runs against a real loopback server. The reconnect logic uses
 * `setTimeout(..., 10000)`, which would leak a live timer (and an endless
 * reconnect loop) into the test process; the close/error/reconnect cases run
 * inside `withCapturedTimers`, which records the schedule so the test can
 * inspect it and choose whether to fire it. close() cancels a pending
 * reconnect, which is covered here too.
 *
 * The 5s idle `timeout` handler is the one path left uncovered: triggering it
 * for real would mean a 5-second test, which is not worth it for two lines that
 * only log and destroy the socket.
 */
import { expect } from 'chai'
import * as net from 'net'
import * as tcp from '../../src/tcp'
import { withCapturedTimers } from '../helpers/timers'
import type { VEDirectParser } from '../../src/Parser'

function listen(server: net.Server): Promise<void> {
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve())
  )
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

async function freePort(): Promise<number> {
  const probe = net.createServer()
  await listen(probe)
  const port = (probe.address() as net.AddressInfo).port
  await closeServer(probe)
  return port
}

const isConnectionClose = (m: string): boolean =>
  m.includes('connection to') && m.includes('closed')

describe('tcp transport', () => {
  it('forwards received bytes to the parser and closes cleanly', async () => {
    const server = net.createServer((sock) => sock.write('PID\t0x204\n'))
    await listen(server)
    const port = (server.address() as net.AddressInfo).port

    const received: Buffer[] = []
    let resolveData: () => void = () => {}
    const gotData = new Promise<void>((r) => (resolveData = r))
    const parser = [
      {
        addChunk: (data: Buffer) => {
          received.push(data)
          resolveData()
        }
      }
    ] as unknown as VEDirectParser[]
    const logs: string[] = []

    tcp.connect('127.0.0.1', port, parser, (m) => logs.push(m), 0)
    await gotData
    tcp.close((m) => logs.push(m), 0)
    await closeServer(server)

    expect(Buffer.concat(received).toString()).to.equal('PID\t0x204\n')
    expect(logs.some((m) => m.includes(`Connection to 127.0.0.1:${port}`))).to
      .be.true
    expect(logs.some((m) => m.includes('TCP port closed'))).to.be.true
  })

  it('logs and schedules a reconnect after an unexpected close', async () => {
    const deadPort = await freePort() // nothing is listening here
    const logs: string[] = []
    let resolveClosed: () => void = () => {}
    const closed = new Promise<void>((r) => (resolveClosed = r))
    const debug = (m: string): void => {
      logs.push(m)
      if (isConnectionClose(m)) resolveClosed()
    }
    const parser = [] as unknown as VEDirectParser[]

    await withCapturedTimers(async (timers) => {
      tcp.connect('127.0.0.1', deadPort, parser, debug, 0)
      await closed
      expect(
        timers.some((t) => t.delay === 10000),
        'reconnect scheduled'
      ).to.be.true
      tcp.close(() => {}, 0) // cancels the pending reconnect (timer branch)
    })

    expect(logs.some((m) => m.includes('TCP connection error'))).to.be.true
  })

  it('reconnects when the captured reconnect timer is fired', async () => {
    const server = net.createServer((sock) => sock.end()) // accept then drop
    await listen(server)
    const port = (server.address() as net.AddressInfo).port

    const logs: string[] = []
    let resolveClosed: () => void = () => {}
    const closed = new Promise<void>((r) => (resolveClosed = r))
    const debug = (m: string): void => {
      logs.push(m)
      if (isConnectionClose(m)) resolveClosed()
    }
    const parser = [] as unknown as VEDirectParser[]

    await withCapturedTimers(async (timers) => {
      tcp.connect('127.0.0.1', port, parser, debug, 0)
      await closed
      const reconnect = timers.find((t) => t.delay === 10000)
      expect(reconnect, 'a reconnect was scheduled').to.not.equal(undefined)
      reconnect!.cb() // runs the reconnect body: log + connect()
      tcp.close(() => {}, 0)
    })

    await closeServer(server)
    expect(logs.some((m) => m.includes('Trying to reconnect'))).to.be.true
  })

  it('close() on an index with no socket is a no-op', () => {
    const logs: string[] = []
    expect(() => tcp.close((m) => logs.push(m), 9)).to.not.throw()
    expect(logs).to.have.lengthOf(0)
  })
})
