const serial = require('./lib/serial')
const udp = require('./lib/udp')
const tcp = require('./lib/tcp')
const Parser = require('./lib/Parser')

module.exports = function (app) {
  let parser = null
  const plugin = {}

  plugin.id = 'vedirect-signalk'
  plugin.name = 'VE.Direct to Signal K'
  plugin.description = plugin.name

  plugin.schema = {
    type: 'object',
    required: [
      'device'
    ],
    properties: {
      device: {
        type: 'string',
        title: 'USB device',
        description: '/dev/ttyUSB0 for example'
      },
      udpPort: {
        type: 'number',
        title: 'UDP port',
        description: 'Leave USB device and TCP empty to use UDP',
        default: 7878
      },
      host: {
        type: 'string',
        title: 'TCP host',
        description: 'Leave USB device and UDP empty to use TCP'
      },
      tcpPort: {
        type: 'number',
        title: 'TCP port',
        description: 'Leave USB device and UDP empty to use TCP',
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
    }
  }

  plugin.start = function (options) {
    parser = new Parser(options)

    parser.on('delta', delta => {
      app.handleMessage('pluginId', delta)
    })

    if (options.device) {
      serial.open(options.device, parser)
    } else if (options.udpPort) {
      udp.listen(options.udpPort, parser, app.debug)
    } else if (options.tcpPort && options.host) {
      tcp.connect(options.host, options.tcpPort, parser, app.debug)
    } else {
      app.error('Configure either USB device, UDP port or TCP host and port')
    }

  }

  plugin.stop = function () {
    if (parser) {
      parser.removeAllListeners()
      parser = null
    }
    serial.close()
    udp.close(app.debug)
    tcp.close(app.debug)
  }

  return plugin
}
