const fs = require('fs')
const debug = require('debug')('signalk-vedirect-parser')
let port = null

exports.open = function openFileStream (path, parser) {
  if (port !== null) {
    try {
      port.close()
      port = null
    } catch (e) {}
  }

  port = fs.createReadStream(path, 'ascii')

  port.on('data', chunk => {
    if (Buffer.isBuffer(chunk)) {
      chunk = chunk.toString('ascii')
    }

    parser.addChunk(chunk)
  })

  // @NOTE FT: should we implement reconenct/back-off code like TCP wrappers?
  //        I assume the serial port only closes if the physical line is broken/disconnected?

  port.on('error', err => {
    debug('file stream error: ' + err.message)
  })
}

exports.close = function (device) {
  if (port !== null) {
    try {
      port.close()
      port = null
    } catch (e) {}
  }
}
