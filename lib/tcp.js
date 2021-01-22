const Net = require('net');
let connectionActive = false;
let client;

function makeConnection(host, port, debug) {
  client = new Net.Socket();
  let conn = client.connect({ port: port, host: host });
  debug(`Connection to ${host}:${port}`);
  connectionActive = true;
  return conn
}

function onData(msg, parser, debug) {
  parser.addChunk(msg);
  debug(`${msg}`);
}

function onClose(host, port, parser, debug) {
  if(connectionActive) {
    setTimeout(() => {
      debug('Trying to reconnect');
      client.destroy();
      module.exports.connect(host, port, parser, debug);
    }, 10000)
  }
}

module.exports = {
  connect: (host, port, parser, debug) => {
    client = makeConnection(host, port, debug);
    client.on('data', (msg) => {
      onData(msg, parser, debug);
    });
    client.on('close', () => {
      debug('Connection closed');
      onClose(host, port, parser, debug);
    });
    client.on('error', () => {
      debug('Connection error');
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
