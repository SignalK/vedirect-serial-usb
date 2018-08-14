var serialport = require('serialport');

//
// BMV
//
var serialport = require('serialport');

var bmvdata = {};

//Add checksum test

function get_product_longname(pid) {
  if (pid == "0x203") return("BMV-700");
  if (pid == "0x204") return("BMV-702");
  if (pid == "0x205") return("BMV-700H");
  if (pid == "0x300") return("BlueSolar MPPT 70/15");
  if (pid == "0xA040") return("BlueSolar MPPT 75/50");
  if (pid == "0xA041") return("BlueSolar MPPT 150/35");
  if (pid == "0xA042") return("BlueSolar MPPT 75/15");
  if (pid == "0xA043") return("BlueSolar MPPT 100/15");
  if (pid == "0xA044") return("BlueSolar MPPT 100/30");
  if (pid == "0xA045") return("BlueSolar MPPT 100/50");
  if (pid == "0xA046") return("BlueSolar MPPT 150/70");
  if (pid == "0xA047") return("BlueSolar MPPT 150/100");
  if (pid == "0xA049") return("BlueSolar MPPT 100/50 rev2");
  return ("Unknown");
};

function getAlarmReason(alarmReason){
  //var lowVoltage = 1
  //var highVoltage = 2
  var lowSOC = 4
  var lowStarterVoltage = 8
  var highStarterVoltage = 16
  var lowTemp = 32
  var highTemp = 64
  var midVoltage = 128
  var overload = 256
  var dcRipple = 512
  var lowV_AC_out = 1024
  var highV_AC_out = 2048
  if (alarmReason & 1){
    console.log("low voltage")
  }
  if (alarmReason & 2){
    console.log("high voltage")
  }
}

function parse_serial(line) {
  var res = line.split("\t");

  switch(res[0]) {
    case    'V':
    bmvdata.mainBattVoltage = Math.floor(res[1]/10)/100;
    break;
    case    'VS':
    bmvdata.auxBatteryVoltage = Math.floor(res[1]/10)/100;
    break;
    case    'VM':
    bmvdata.midPointVoltage = res[1];
    break;
    case    'DM':
    bmvdata.midPointDeviation = res[1];
    break;
    case    'VPV':
    bmvdata.panelVoltage = res[1];
    break;
    case    'PPV':
    bmvdata.panelPower = res[1];
    break;
    case    'I':
    bmvdata.batteryCurrent = res[1];
    break;
    case    'IL':
    bmvdata.loadCurrent = res[1];
    break;
    case    'LOAD':
    bmvdata.loadOutputState = res[1];
    break;
    case    'T':
    bmvdata.batteryTemperature = res[1];
    break;
    case    'P':
    bmvdata.instantPower = res[1];
    break;
    case    'CE':
    bmvdata.consumedAh = res[1];
    break;
    case    'SOC':
    bmvdata.stateOfCharge = res[1]/10;
    break;
    case    'TTG':
    bmvdata.timeToGo = res[1];
    break;
    case    'Alarm':
    bmvdata.alarm = res[1];
    break;
    case    'Relay':
    bmvdata.relay = res[1];
    break;
    case    'AR':
    bmvdata.alarmReason = res[1]; //to be lookup from octal value
    break;
    case    'H1':
    bmvdata.depthOfDeepestDischarge = res[1];
    break;
    case    'H2':
    bmvdata.depthOfLastDischarge = res[1];
    break;
    case    'H3':
    bmvdata.depthOfAverageDischarge = res[1];
    break;
    case    'H4':
    bmvdata.numberOfChargeCycles = res[1];
    break;
    case    'H5':
    bmvdata.numberOfFullDischarges = res[1];
    break;
    case    'H6':
    bmvdata.cumulativeAhDrawn = res[1];
    break;
    case    'H7':
    bmvdata.minimumMainBattVoltage = res[1];
    break;
    case    'H8':
    bmvdata.maximumMainBattVoltage = res[1];
    break;
    case    'H9':
    bmvdata.secondsSinceLastFullCharge = res[1];
    break;
    case    'H10':
    bmvdata.numberOfAutoSync = res[1];
    break;
    case    'H11':
    bmvdata.numberOfLowMainVoltageAlarms = res[1];
    break;
    case    'H12':
    bmvdata.numberOfHighMainVoltageAlarms = res[1];
    break;
    case    'H13':
    bmvdata.numberOfLowAuxVoltageAlarms = res[1];
    break;
    case    'H14':
    bmvdata.numberOfHighAuxVoltageAlarms = res[1];
    break;
    case    'H15':
    bmvdata.minimumAuxBattVoltage = res[1];
    break;
    case    'H16':
    bmvdata.maximumAuxBattVoltage = res[1];
    break;
    case    'H17':
    bmvdata.dischargedEnergy = res[1];
    break;
    case    'H18':
    bmvdata.chargedEnergy = res[1];
    break;
    case    'H19':
    bmvdata.yieldTotal = res[1];
    break;
    case    'H20':
    bmvdata.yieldToday = res[1];
    break;
    case    'H21':
    bmvdata.maximumPowerToday = res[1];
    break;
    case    'H22':
    bmvdata.yieldYesterday = res[1];
    break;
    case    'H23':
    bmvdata.maximumPowerYesterday = res[1];
    break;
    case    'ERR':
    bmvdata.errorCode = res[1];
    break;
    case    'CS':
    bmvdata.stateOfOperation = res[1];
    break;
    case    'FW':
    bmvdata.firmwareVersion = res[1];
    break;
    case    'PID':
    bmvdata.PID = res[1];
    bmvdata.LONG = get_product_longname(res[1]);
    break;
    case    'SER#':
    bmvdata.serialNumber = res[1];
    break;
    case    'HSDS':
    bmvdata.daySequenceNumber = res[1];
    break;
    case    'MODE':
    bmvdata.deviceMode = res[1];
    break;
    case    'AC_OUT_V':
    bmvdata.acOutputVoltage = res[1];
    break;
    case    'AC_OUT_I':
    bmvdata.acOutputCurrent = res[1];
    break;
    case    'WARN':
    bmvdata.warningReason = res[1];
    break;

  }
}

exports.open = function(ve_port) {
  port =  new serialport(ve_port, {
    baudrate: 19200,
    parser: serialport.parsers.readline('\r\n')});
    port.on('data', function(line) {
      //                   parse_serial(ve_port, line);
      parse_serial(line);
    });

  }

  exports.update = function() {
    return bmvdata;
  }

  exports.close = function() {
  }
