const Net = require('net');
let client = [];

function makeConnection(host, port, debug, items) {
  client[items] = new Net.Socket();
  client[items].connect({ port: port, host: host });
  client[items].setTimeout(5000);
  debug(`Connection to ${host}:${port}`);
  return client[items]
}

function onData(msg, parser, debug, items) {
  parser[items].addChunk(msg, items);
  debug(`${msg}`);
}

function onClose(host, port, parser, debug, items) {
  if(client[items]) {
    setTimeout(() => {
      debug('Trying to reconnect');
      module.exports.connect(host, port, parser, debug, items);
    }, 10000);
  }
}

module.exports = {
  connect: (host, port, parser, debug, items) => {
    client[items] = makeConnection(host, port, debug, items);
    client[items].on('data', (msg) => {
      onData(msg, parser, debug, items);
    });
    client[items].on('close', () => {
      debug('TCP connection closed');
      client[items].destroy();
      onClose(host, port, parser, debug, items);
    });
    client[items].on('error', () => {
      debug('TCP connection error');
      client[items].destroy();
    });
    client[items].on('timeout', () => {
      debug('TCP connection timeout');
      client[items].destroy();
    }); 
  },
  close: (debug, items) => {
    if (client[items]) {
      client[items].destroy();
      client[items] = null;
      debug(`TCP port closed`);
    }
  }  
}
