var vedirect = require( 'vedirect' );
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
      }
    }
  }
  plugin.start = function(options)
  {
    vedirect.open(options.device);
    forever {
      bmvdata = vedirect.update();
      console.log(bmvdata.V);
    }

  }
  plugin.stop = function(options)
  {
    vedirect.close(options.device);
  }
  return plugin
}
