var EventEmitter = require('events').EventEmitter;
var util = require('util');
var Oplog = require('mongo-oplog');
var Timestamp = require('mongodb').Timestamp;

var getStartTime = function(options){
  var startFrom = options.startFrom || new Date();
  startFrom.setMinutes(0);
  startFrom.setSeconds(0);
  startFrom.setMilliseconds(0);
  return new Timestamp(0, startFrom.getTime() / 1000);
};

var Bus = function(options){
  this.options = options;
  this.monitoring = false;
  EventEmitter.call(this);
};

util.inherits(Bus, EventEmitter);

var getOplogConfig = function(options){
  var connectionString = options.connectionString;
  var ns = options.ns;

  var connParts = connectionString.split('?');
  var connStr = connParts[0].split('/');
  var db = connStr.pop();
  var ns = db+'.'+options.collection||'bus';
  var config = {
          since: getStartTime(options)
        };
  connStr.push('local');
  connStr = connStr.join('/');
  return {
    connectionString: connStr,
    ns: ns,
    config: config
  };
};

Bus.prototype.broadcast = function(msg, data){

};

Bus.prototype.start = function(){
  var options = this.options;
  var oplogConfig = getOplogConfig(options);

  var opLog = new Oplog(oplogConfig.connectionString,
          oplogConfig.ns,
          oplogConfig.config)
        .tail(function(){
          this.monitoring = opLog;
          this.emit('started', opLog);
        }.bind(this));
  opLog.filter(oplogConfig.ns).on('insert', function(doc){
    this.emit('event', doc.o);
  }.bind(this));
  opLog.stop(function(){
    this.monitoring = false;
    this.emit('stopped');
  }.bind(this));
};

module.exports = {
  Bus: Bus
};
