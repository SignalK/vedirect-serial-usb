const SerialPort = require('serialport')
const Delimiter = require('@serialport/parser-delimiter')
let port = []
let delim = []

module.exports = {
  open: (device, parser, debug, items) => {
    if (typeof port[items] !== 'undefined' ) {
      try {
        port[items].close()
        port[items] = undefined
      } catch (e) {}
    }

    debug(`Serial: connecting to ${device}`)

    port[items] = new SerialPort(device, { baudRate: 19200 }) // @NOTE FT: should this be configurable?

    port[items].on('open', function() {
      debug(`Connected to ${device}`)
    })

    port[items].on('data', chunk => {
      debug(`${chunk}`)
    })

    delim[items] = port[items].pipe(new Delimiter({delimiter: '\r' , includeDelimiter: true}))

    delim[items].on('data', chunk => {
      // Chunk is a node.js Buffer
      parser[items].addChunk(chunk, items)
      debug(`${chunk}`)
    })

    port[items].on('error', err => {
      debug(`SerialPort error: ` + err.message)
    })
  },
  close: (debug, items) => {
    if (port[items]) {
      try {
        port[items].close()
        port[items] = undefined
        debug(`Serial port closed`);
      } catch (e) {}
    }
  }
}