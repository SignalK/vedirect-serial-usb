var vedirect = require( './vedirect' );
var bmvdata = {};

module.exports = function(app)
{
  var plugin = {};
  let selfContext = 'vessels.' + app.selfId

  plugin.id = "vedirect-signalk"
  plugin.name = "VE.Direct to Signal K"
  plugin.description = plugin.name

  plugin.schema = {
    type: "object",
    required: [
      "device"
    ],
    properties: {
      device: {
        type: "string",
        title: "USB device",
        default: "/dev/ttyUSB0"
      },
      mainBatt: {
        type: "string",
        title: "Main Battery name in SK path",
        default: "House"
      },
      auxBatt: {
        type: "string",
        title: "Aux Battery name in SK path",
        default: "Starter"
      }
    }
  }
  plugin.start = function(options)
  {
    vedirect.open(options.device);

      bmvdata = vedirect.update();
      console.log(bmvdata.mainBattVoltage);


  }
  plugin.stop = function(options)
  {
    vedirect.close(options.device);
  }
  return plugin
}
