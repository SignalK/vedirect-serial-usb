const Net = require('net');
let connectionActive = false;
let client;

function makeConnection(host, port) {
  client = new Net.Socket();
  let conn = client.connect({ port: port, host: host }, function() {
    connectionActive = true;
  });
  return conn
}

function onData(msg, parser, debug) {
  parser.addChunk(msg);
  debug(`${msg}`);
}

module.exports = {
  connect: (host, port, parser, debug) => {
    client = makeConnection(host, port);
    client.on('data', (msg) => {
      onData(msg, parser, debug);
    });
    client.on('close', () => {
      debug('Connection closed')
      if(connectionActive) {
        setTimeout(() => {
          client.destroy();
          module.exports.connect(host, port, parser, debug);
        }, 5000)
      }
    });
    client.on('error', () => {
      debug('Connection error')
    });

  },
  close: (debug) => {
    if (client) {
      client.destroy();
      client = null;
      connectionActive = false;
    }
  }  
}
