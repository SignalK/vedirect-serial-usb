const fs = require('fs')
const join = require('path').join
const chai = require('chai')
const Parser = require('../lib/Parser')
const expect = chai.expect
const parser = new Parser()

let lines = []

describe('VE.direct parser', () => {
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

  it('Parses each line withouth error', done => {
    try {
      let parsed = {}
      const listener = data => {
        parsed = data
      }

      parser.on('parsed', listener)

      lines.forEach(line => {
        parser.addChunk(line)
      })

      parser.removeListener('parsed', listener)
      expect(Object.keys(parsed).length).to.be.a('number')
      expect(Object.keys(parsed).length).to.equal(212)
      done()
    } catch (err) {
      done(err)
    }
  })

  it('Parses the correct number of keys', done => {
    try {
      let parsed = {}
      const listener = data => {
        parsed = data
      }

      parser.on('parsed', listener)

      lines.forEach(line => {
        parser.addChunk(line)
      })

      parser.removeListener('parsed', listener)
      expect(Object.keys(parsed).length).to.be.a('number')
      expect(Object.keys(parsed).length).to.equal(28)
      done()
    } catch (err) {
      done(err)
    }
  })
})
