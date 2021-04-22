const serial = require('./lib/serial')
const udp = require('./lib/udp')
const tcp = require('./lib/tcp')
const Parser = require('./lib/Parser')
const VEDirect = require('./standalone')

module.exports = function (app) {
  let parser = []
  let shaddow = null
  const plugin = {}
  plugin.id = 'vedirect-signalk'
  plugin.name = 'VE.Direct to Signal K'
  plugin.description = plugin.name

  plugin.start = function (options) {
    shaddow = options;

    if (typeof options.vedirect !== 'undefined') {
      Object.keys(options.vedirect).forEach(items => {
        parser[items] = new Parser(options)

        parser[items].on('delta', delta => {
          app.handleMessage('pluginId', delta)
        })

        let type = options.vedirect[items].device;
        let connection = options.vedirect[items].connection;
        let port = options.vedirect[items].port;
        if (type == 'Serial') {
          serial.open(connection, parser, app.debug, items)
        } else if (type == 'UDP') {
          udp.listen(port, parser, app.debug, items)
        } else if (type == 'TCP') {
          tcp.connect(connection, port, parser, app.debug, items)
        } 
      });
    } else {
      if (options.device) {
        oldConfig = {vedirect: [{device: 'Serial', connection: options.device, ignoreChecksum: options.ignoreChecksum,
          mainBatt: options.mainBatt, auxBatt: options.auxBatt, solar: options.solar}]}
      } else if (options.udpPort) {
        oldConfig = {vedirect: [{device: 'UDP', port: options.udpPort, ignoreChecksum: options.ignoreChecksum,
          mainBatt: options.mainBatt, auxBatt: options.auxBatt, solar: options.solar}]}
      } else if (options.host) {
        oldConfig = {vedirect: [{device: 'TCP', connection: options.host, port: options.tcpPort, ignoreChecksum: options.ignoreChecksum,
          mainBatt: options.mainBatt, auxBatt: options.auxBatt, solar: options.solar}]}
      }
      parser[0] = new Parser(oldConfig)

      parser[0].on('delta', delta => {
        app.handleMessage('pluginId', delta)
      })

      if (options.device) {
        serial.open(options.device, parser, app.debug, 0)
      } else if (options.udpPort) {
        udp.listen(options.udpPort, parser, app.debug, 0)
      } else if (options.host) {
        tcp.connect(options.host, options.tcpPort, parser, app.debug, 0)
      }
    }
  }

  plugin.stop = function () {
    if (shaddow) {
      if (typeof shaddow.vedirect !== 'undefined') {
        Object.keys(shaddow.vedirect).forEach(items => {
          parser[items].removeAllListeners()
          parser[items] = null
          let type = shaddow.vedirect[items].device;
          if (type == 'Serial') {
            serial.close(app.debug, items)
          } else if (type == 'UDP') {
            udp.close(app.debug, items)
          } else {
            tcp.close(app.debug, items)
          }
        });
      } else {
        parser[0].removeAllListeners()
        parser[0] = null
        if (shaddow.device) {
          serial.close(app.debug, 0)
        } else if (shaddow.udpPort) {
          udp.close(app.debug, 0)
        } else if (shaddow.host) {
          tcp.close(app.debug, 0)
        }
      }
      shaddow = null
    }
  }

  plugin.schema = {
    type: 'object',
    properties: {
      vedirect: {
        type: 'array',
        title: 'Connections',
        description: 'Connections to VE.Direct devices',
        items: {
          type: 'object',
          required: [],
          properties: {
            device: {
              type: 'string',
              default: 'Serial',
              title: 'Select device',
              enum: [
                'Serial',
                'UDP',
                'TCP',
              ],
            },
            connection: {
              type: 'string',
              title: 'Connection details',
              description: 'Serial: e.g. /dev/ttyUSB0,  UDP: ignored  or  TCP: IP address',
              default: '/dev/ttyUSB0'
            },
            port: {
              type: 'number',
              title: 'Port',
              description: 'Serial: ignored, UDP/TCP: port',
              default: 7878
            },
            ignoreChecksum: {
              type: 'boolean',
              title: 'Ignore Checksum',
              default: true
            },
            mainBatt: {
              type: 'string',
              title: 'Main Battery name in SK path',
              default: 'House'
            },
            auxBatt: {
              type: 'string',
              title: 'Aux Battery name in SK path',
              default: 'Starter'
            },
            solar: {
              type: 'string',
              title: 'Solar name in SK path',
              default: 'Main'
            }
          },
        },
      },
    },
  }

  return plugin
}
