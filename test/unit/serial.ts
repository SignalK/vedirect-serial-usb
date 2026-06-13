/**
 * Unit tests for the serial transport (src/serial.ts).
 *
 * A real serial port cannot be opened in a test run, so `serialport` and its
 * delimiter parser are replaced (via the require cache) with controllable fakes
 * that drive every handler - open, data, error, and the delimited line feed -
 * deterministically. The unexpected-close reconnect uses `setTimeout`, so those
 * cases run inside `withCapturedTimers` to record the schedule without arming a
 * real 10s timer.
 */
import { expect } from 'chai'
import { requireFresh } from '../helpers/moduleStub'
import { withCapturedTimers } from '../helpers/timers'
import type { VEDirectParser } from '../../src/Parser'

/** Fake serialport whose handlers can be fired on demand. close() emits a
 *  'close' event like the real port; the constructed instances are collected so
 *  a test can reach into them. */
class FakeSerialPort {
  static instances: FakeSerialPort[] = []
  handlers: Record<string, (arg?: unknown) => void> = {}
  piped: FakeDelimiter | null = null
  closed = false
  closeThrows = false
  // Mirrors SerialPort.isOpen; defaults to open since write() is only exercised
  // after open(). A test flips it to false to model the reconnect gap.
  isOpen = true
  written: string[] = []
  writeThrows = false

  constructor(public readonly opts: { path: string; baudRate: number }) {
    FakeSerialPort.instances.push(this)
  }
  on(event: string, cb: (arg?: unknown) => void): this {
    this.handlers[event] = cb
    return this
  }
  pipe(delim: FakeDelimiter): FakeDelimiter {
    this.piped = delim
    return delim
  }
  write(data: string): void {
    if (this.writeThrows) throw new Error('port dropped mid-write')
    this.written.push(data)
  }
  close(): void {
    if (this.closeThrows) throw new Error('already gone')
    this.closed = true
    this.fire('close')
  }
  fire(event: string, arg?: unknown): void {
    this.handlers[event]?.(arg)
  }
}

class FakeDelimiter {
  handlers: Record<string, (chunk: Buffer) => void> = {}
  constructor(public readonly opts: unknown) {}
  on(event: string, cb: (chunk: Buffer) => void): this {
    this.handlers[event] = cb
    return this
  }
  fire(event: string, chunk: Buffer): void {
    this.handlers[event]?.(chunk)
  }
}

type SerialModule = typeof import('../../src/serial')

function loadSerial(): SerialModule {
  return requireFresh<SerialModule>('src/serial', {
    serialport: { SerialPort: FakeSerialPort },
    '@serialport/parser-delimiter': { DelimiterParser: FakeDelimiter }
  })
}

const noParser = [] as unknown as VEDirectParser[]

describe('serial transport', () => {
  beforeEach(() => {
    FakeSerialPort.instances = []
  })

  it('opens at 19200 baud and wires the parser to delimited data', () => {
    const serial = loadSerial()
    const chunks: Array<{ data: Buffer; index: number }> = []
    const parser = [
      {
        addChunk: (data: Buffer, index: number) => chunks.push({ data, index })
      }
    ] as unknown as VEDirectParser[]
    const logs: string[] = []

    serial.open('/dev/ttyUSB0', parser, (m) => logs.push(m), 0)

    const sp = FakeSerialPort.instances[0]!
    expect(sp.opts).to.deep.equal({ path: '/dev/ttyUSB0', baudRate: 19200 })

    sp.fire('open')
    sp.fire('data', Buffer.from('raw'))
    sp.piped!.fire('data', Buffer.from('PID\t0x204\n'))
    sp.fire('error', new Error('cable unplugged'))

    expect(chunks).to.deep.equal([
      { data: Buffer.from('PID\t0x204\n'), index: 0 }
    ])
    expect(logs.some((m) => m.includes('connecting to /dev/ttyUSB0'))).to.be
      .true
    expect(logs.some((m) => m.includes('Connected to /dev/ttyUSB0'))).to.be.true
    expect(
      logs.some((m) =>
        m.includes('SerialPort error on /dev/ttyUSB0: cable unplugged')
      )
    ).to.be.true
  })

  it('closes a previously opened port before reopening the same index', () => {
    const serial = loadSerial()
    serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
    serial.open('/dev/ttyUSB1', noParser, () => {}, 0)

    expect(FakeSerialPort.instances).to.have.lengthOf(2)
    expect(FakeSerialPort.instances[0]!.closed, 'first port closed').to.be.true
  })

  it('swallows errors thrown while closing a stale port on reopen', () => {
    const serial = loadSerial()
    serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
    FakeSerialPort.instances[0]!.closeThrows = true
    expect(() =>
      serial.open('/dev/ttyUSB1', noParser, () => {}, 0)
    ).to.not.throw()
  })

  it('close() closes the open port and logs it', () => {
    const serial = loadSerial()
    const logs: string[] = []
    serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
    serial.close((m) => logs.push(m), 0)

    expect(FakeSerialPort.instances[0]!.closed).to.be.true
    expect(logs.some((m) => m.includes('Serial port closed'))).to.be.true
  })

  it('close() on an index with no open port still logs and does not throw', () => {
    const serial = loadSerial()
    const logs: string[] = []
    expect(() => serial.close((m) => logs.push(m), 5)).to.not.throw()
    expect(logs.some((m) => m.includes('Serial port closed'))).to.be.true
  })

  it('swallows errors thrown by close()', () => {
    const serial = loadSerial()
    serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
    FakeSerialPort.instances[0]!.closeThrows = true
    expect(() => serial.close(() => {}, 0)).to.not.throw()
  })

  it('schedules a reconnect on an unexpected close and close() cancels it', async () => {
    const serial = loadSerial()
    const logs: string[] = []
    await withCapturedTimers(async (timers) => {
      serial.open('/dev/ttyUSB0', noParser, (m) => logs.push(m), 0)
      FakeSerialPort.instances[0]!.fire('close') // cable yanked, not a close()

      expect(
        timers.some((t) => t.delay === 10000),
        'reconnect scheduled'
      ).to.be.true
      expect(logs.some((m) => m.includes('reconnecting in'))).to.be.true

      serial.close(() => {}, 0) // cancels the pending reconnect timer
    })
  })

  it('fires the reconnect timer to re-open the port', async () => {
    const serial = loadSerial()
    await withCapturedTimers(async (timers) => {
      serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
      FakeSerialPort.instances[0]!.fire('close')

      const reconnect = timers.find((t) => t.delay === 10000)
      expect(reconnect, 'a reconnect was scheduled').to.not.equal(undefined)
      reconnect!.cb() // reconnect body re-opens the port

      expect(FakeSerialPort.instances.length).to.equal(2)
      serial.close(() => {}, 0)
    })
  })

  describe('write', () => {
    it('writes a command to the open port and reports success', () => {
      const serial = loadSerial()
      serial.open('/dev/ttyUSB0', noParser, () => {}, 0)

      const ok = serial.write(':84E030001FB\n', 0)

      expect(ok).to.be.true
      expect(FakeSerialPort.instances[0]!.written).to.deep.equal([
        ':84E030001FB\n'
      ])
    })

    it('reports failure when no port exists for the index', () => {
      const serial = loadSerial()
      expect(serial.write(':84E030001FB\n', 3)).to.be.false
    })

    it('reports failure (and does not write) when the port is not open', () => {
      const serial = loadSerial()
      serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
      FakeSerialPort.instances[0]!.isOpen = false // e.g. awaiting reconnect

      const ok = serial.write(':84E030001FB\n', 0)

      expect(ok).to.be.false
      expect(FakeSerialPort.instances[0]!.written).to.have.lengthOf(0)
    })

    it('reports failure when the underlying write throws', () => {
      const serial = loadSerial()
      serial.open('/dev/ttyUSB0', noParser, () => {}, 0)
      FakeSerialPort.instances[0]!.writeThrows = true

      expect(serial.write(':84E030001FB\n', 0)).to.be.false
    })
  })
})
