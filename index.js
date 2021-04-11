const serial = require('./lib/serial')
const udp = require('./lib/udp')
const tcp = require('./lib/tcp')
const Parser = require('./lib/Parser')

module.exports = function (app) {
  let parser = []
  let shaddow = null
  const plugin = {}

  plugin.id = 'vedirect-signalk'
  plugin.name = 'VE.Direct to Signal K'
  plugin.description = plugin.name

  plugin.start = function (options) {
    shaddow = options;

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
  }

  plugin.stop = function () {
    if (shaddow) {
      Object.keys(shaddow.vedirect).forEach(items => {
        parser[items].removeAllListeners()
        parser[items] = null

        let type = shaddow.vedirect[items].device;
        let connection = shaddow.vedirect[items].connection;
        let port = shaddow.vedirect[items].port;
        if (type == 'Serial') {
          serial.close(app.debug, items)
        } else if (type == 'UDP') {
          udp.close(app.debug, items)
        } else {
          tcp.close(app.debug, items)
        }
      });
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
              title: 'port',
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
