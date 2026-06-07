import * as fs from 'fs'
import { join } from 'path'
import { expect } from 'chai'
import { VEDirectParser } from '../src/Parser'
import type { SKDelta } from '../src/types'

const parser = new VEDirectParser({
  vedirect: [
    {
      device: 'UDP',
      connection: 'localhost',
      port: 7878,
      ignoreChecksum: true,
      mainBatt: 'House',
      auxBatt: 'Starter',
      bmv: 'bmv',
      solar: 'Main'
    }
  ]
})

let lines: string[] = []

describe('VE.Direct parser', () => {
  before(() => {
    const text = fs.readFileSync(join(__dirname, 'sampleOutput.txt'), 'utf-8')
    lines = text.split('\n').map((line) => `\n${line}`)
  })

  it('Reads the log file and finds multiple lines', () => {
    expect(lines.length).to.be.a('number')
    expect(lines.length).to.be.above(1)
  })

  it('Parses each line that has a Signal K representation without error', () => {
    const parsed: SKDelta[] = []

    const listener = (delta: SKDelta): void => {
      parsed.push(delta)
    }

    parser.on('delta', listener)

    lines.forEach((line) => {
      parser.addChunk(Buffer.from(line), 0)
    })

    parser.removeListener('delta', listener)
    expect(parsed.length).to.be.a('number')
    expect(parsed.length).to.equal(16)
  })
})
