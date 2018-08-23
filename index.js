const serial = require('./lib/serial')
const Parser = require('./lib/Parser')

module.exports = function (app) {
  let parser = null
  const plugin = {}
  // const selfContext = 'vessels.' + app.selfId

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
        default: '/dev/ttyUSB0'
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
      }
    }
  }

  plugin.start = function (options) {
    parser = new Parser(options)

    // @TODO implement delta generation in parser and handle here
    parser.on('delta', delta => {
app.handleMessage('pluginId', delta)
      // Do something with delta; pass on to app.
    })
    // 

    serial.open(options.device, parser)
  }

  plugin.stop = function () {
    if (parser) {
      parser.removeAllListeners()
      parser = null
    }

    serial.close()
  }

  return plugin
}
