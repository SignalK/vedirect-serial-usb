const SerialPort = require('serialport')
const Readline = SerialPort.parsers.Readline
let port = null

exports.open = function openSerialConnection (device, parser) {
  if (port !== null) {
    try {
      port.close()
      port = null
    } catch (e) {}
  }

  port = new SerialPort(device, { baudRate: 19200 })
  const rl = port.pipe(new Readline())

  rl.on('data', line => {
    // @TODO replace with method that adds the line to the parsers' internal cache, which will keep filling up until it hits the end of a block
    // e.g. parser.addLine(line)
    parser.parse(line)
  })

  // @FIXME implement reconnect with back-off code
  // @FIXME implement error handling for serial
}

exports.close = function (device) {
  if (port !== null) {
    try {
      port.close()
      port = null
    } catch (e) {}
  }
}
