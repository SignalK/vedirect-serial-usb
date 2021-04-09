const SerialPort = require('serialport')
const Delimiter = require('@serialport/parser-delimiter')
const debug = require('debug')('signalk-vedirect-parser')
let port = []
let delim = []
port = null

exports.open = function openSerialConnection (device, parser, items) {
  if (port[items] !== null) {
    try {
      port[items].close()
      port[items] = null
    } catch (e) {}
  }

  port[items] = new SerialPort(device, { baudRate: 19200 }) // @NOTE FT: should this be configurable?

  delim[items] = port[items].pipe(new Delimiter({delimiter: '\r' , includeDelimiter: true}))

  delim[items].on('data', chunk => {
    // Chunk is a node.js Buffer
    parser.addChunk(chunk, items)
  })

  // @NOTE FT: should we implement reconenct/back-off code like TCP wrappers?
  //        I assume the serial port only closes if the physical line is broken/disconnected?

  port[items].on('error', err => {
    debug('SerialPort error: ' + err.message)
  })
}

exports.close = function (items) {
  if (port[items] !== null) {
    try {
      port[items].close()
      port[items] = null
    } catch (e) {}
  }
}
