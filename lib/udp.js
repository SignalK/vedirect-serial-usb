const dgram = require('dgram');
let socket;

module.exports = {
  listen: (port, parser, debug) => {
    socket = dgram.createSocket('udp4');

    socket.on('listening', () => {
      debug(`listening on UDP ${port}`);
    })

    socket.on('message', (msg, rinfo) => {
      debug(`${rinfo.address}:${rinfo.port}:${msg}`);
      parser.addChunk(msg);
    })

    socket.bind(port);
  },
  close: (debug) => {
    if (socket) {
      socket.close();
      debug(`UDP port closed`);
    }
  }
}