const fs = require('fs')
const path = require('path');

jsonPath = __dirname + '/../../../plugin-config-data';
fs.readFile(path.resolve(jsonPath, 'vedirect-signalk.json'), 'UTF-8', (err, data) => {
  if (err) {
    console.error(err)
    return
  }

  let obj = JSON.parse(data);

  if (typeof obj.configuration.vedirect == 'undefined' ) {
    if (obj.configuration.device) {
      obj.configuration = {
        'vedirect':[{
          'device':'Serial',
          'connection': obj.configuration.device,
          'port': '',
          'ignoreChecksum': obj.configuration.ignoreChecksum,
          'mainBatt': obj.configuration.mainBatt,
          'auxBatt': obj.configuration.auxBatt,
          'solar': obj.configuration.solar
        }]}
    } else if (obj.configuration.udpPort) {
      obj.configuration = {
        'vedirect':[{
          'device':'UDP',
          'connection': 'localhost',
          'port': obj.configuration.udpPort,
          'ignoreChecksum': obj.configuration.ignoreChecksum,
          'mainBatt': obj.configuration.mainBatt,
          'auxBatt': obj.configuration.auxBatt,
          'solar': obj.configuration.solar
        }]}
    } else if (obj.configuration.host) {
      obj.configuration = {
        'vedirect':[{
          'device':'TCP',
          'connection': obj.configuration.host,
          'port': obj.configuration.tcpPort,
          'ignoreChecksum': obj.configuration.ignoreChecksum,
          'mainBatt': obj.configuration.mainBatt,
          'auxBatt': obj.configuration.auxBatt,
          'solar': obj.configuration.solar
        }]}
    }

    let dataOut = JSON.stringify(obj, null, 2)
    fs.writeFile(path.resolve(jsonPath, 'vedirect-signalk.json'), dataOut, 'utf8', function(err) {
      if (err) {
        console.error(err)
        return
      }
    });
  }
});



