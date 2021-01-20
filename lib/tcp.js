const Net = require('net');
let client;

module.exports = {
  connect: (host, port, parser, debug) => {
    client = new Net.Socket();
    client.connect({ port: port, host: host });

    client.on('data', (msg) => {
      debug(`${msg}`);
      parser.addChunk(msg);
    })
  },
  close: (debug) => {
    if (client) {
      client.end();
      debug(`TCP connection closed`);
    }
  }  
}
