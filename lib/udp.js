const dgram = require('dgram');

module.exports = {
  listen: (port, parser, debug) => {
    const socket = dgram.createSocket('udp4')

    socket.on('listening', () => {
      debug(`listening on UDP ${port}`)
    })

    socket.on('message', (msg, rinfo) => {
      debug(`${rinfo.address}:${rinfo.port}:${msg}`)
      parser.addChunk(msg)
    })

    socket.bind(port)
  }
}