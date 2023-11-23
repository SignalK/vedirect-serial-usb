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
    debug('Trying to reconnect');
    client[items].destroy();
    client[items].end();
    module.exports.connect(host, port, parser, debug, items);
  }
}

module.exports = {
  connect: (host, port, parser, debug, items) => {
    client[items] = makeConnection(host, port, debug, items);
    client[items].on('data', (msg) => {
      onData(msg, parser, debug, items);
    });
    client[items].on('close', () => {
      setTimeout(() => {
        debug('TCP connection closed');
        onClose(host, port, parser, debug, items);
      }, 10000);
    });
    client[items].on('error', () => {
      debug('TCP connection error');
      client[items].destroy();
      client[items].end();
    });
    client[items].on('timeout', () => {
      client[items].destroy();
      client[items].end();
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
