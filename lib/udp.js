const dgram = require('dgram');
let socket = [];

module.exports = {
  listen: (port, parser, debug, items) => {
    socket[items] = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    socket[items].on('listening', () => {
      debug(`listening on UDP ${port}`);
    })

    socket[items].on('message', (msg, rinfo) => {
      debug(`${rinfo.address}:${rinfo.port}:${msg}`);
      parser[items].addChunk(msg, items);
    })

    socket[items].bind(port);
  },
  close: (debug, items) => {
    if (socket[items]) {
      socket[items].close();
      socket[items] = null;
      debug(`UDP port closed`);
    }
  }
}