const fs = require('fs')
const join = require('path').join
const chai = require('chai')
const Parser = require('../lib/Parser')
const expect = chai.expect

const parser = new Parser({
  vedirect: [ { device: 'UDP', connection: 'localhost', port: 7878, ignoreChecksum: true, mainBatt: 'House', auxBatt: 'Starter', solar: 'Main' } ]
})

let lines = []

describe('VE.Direct parser', () => {
  before(done => {
    try {
      const text = fs.readFileSync(join(__dirname, '../log/sampleOutput.txt'), 'utf-8')
      lines = text.split('\n').map(line => `\n${line}`)
      done()
    } catch (err) {
      done(err)
    }
  })

  it('Reads the log file and finds multiple lines', done => {
    expect(lines.length).to.be.a('number')
    expect(lines.length).to.be.above(1)
    done()
  })

  it('Parses each line that has a Signal K representation withouth error', done => {
    try {
      let parsed = []
      
      const listener = delta => {
        parsed.push(delta)
      }

      parser.on('delta', listener)

      lines.forEach(line => {
        parser.addChunk(Buffer.from(line), 0)
      })

      parser.removeListener('delta', listener)
      expect(parsed.length).to.be.a('number')
      expect(parsed.length).to.equal(16)
      done()
    } catch (err) {
      done(err)
    }
  })
})
