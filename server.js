try{
  var memwatch = require('memwatch');
  var heapdump = require('heapdump');
}catch(e){
}

var fs = require('fs');
var path = require('path');

var DummyCollection = require('./lib/dummydb').Collection;
var reformFilter = require('./lib/dummydb').reformFilter;

var logger = require('./lib/logger');

var utils = require('./lib/utils');
var config = require('./lib/config');
//var storeConfig = config.store;
var Aggregator = require('./lib/aggregate').Aggregator;
var Oplog = require('mongo-oplog');
var Timestamp = require('mongodb').Timestamp;
var Bus = require('./plugins/bus').Bus;

var statsStore = require('./lib/store');
//var Store = require('./plugins/store');
var webroot = path.join(__dirname, (config.web||{}).site||'/webroot');
var server = require('./lib/server');
var stats = require('./stats.js');
var sift = require('sift');

var reIsFunction = /function\s*[]*\s\(([^)]+)\)*/;
var getFuncInfo = function(source){
  var args = /\(([^)]+)/.exec(source);
  var res = {};
  if (args[1]) {
    res.args = args[1];
  }
  res.body = source.replace(reIsFunction, '');
  return res;
};

logger.info('Static content folder: '+webroot);
//Store = Store.Store || Store;
server.path(webroot);

try{
  fs.mkdirSync('./logs');
}catch(e){}

try{
  memwatch.on('leak', function(info) {
    logger.error(info);
    var file = './logs/' + process.pid + '-' + Date.now() + '.heapsnapshot';
    heapdump.writeSnapshot(file, function(err){
      if(err){
        logger.error(err);
      }else{
        logger.error('Wrote snapshot: ' + file);
      }
    });
  });
}catch(e){
  logger.error('Memwatch not enabled');
}
//var statStore = new DummyCollection();

var encode = function(source){
  var type = typeof(source);
  var encodeObject = function(obj){
    if(obj instanceof Date){
      return obj.toISOString();
    }
    if(obj instanceof RegExp){
      var src = obj.toString().split('/');
      return {
        $regex: src[1],
        $options: src[2]
      };
    }
    var res = {};
    Object.keys(obj).forEach(function(key){
      res[key] = encode(obj[key]);
    });
    return res;
  };
  var encodeArray = function(arr){
    return arr.map(function(item){
      return encode(item);
    });
  };
  switch(type){
    case('boolean'):
    case('string'):
    case('number'):
      return source;
      break;
    case('function'):
      return source.toString();
      break;
    default:
      if(!source){
        return source;
      }
      if(Array.isArray(source)){
        return encodeArray(source);
      }
      return encodeObject(source);
      break;
  }
};

var agg = new Aggregator({
  logger: logger,
  stats: stats,
  store: statsStore
});

server.route([
    {
      method: 'GET',
      path: '/{param*}',
      handler: {
        directory: {
          path: webroot
        }
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregations',
      handler: function(request, reply){
        return reply(encode(agg.stats));
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregations/{name*}',
      handler: function(request, reply){
        var path = request.params.name instanceof Array?request.params.name.join('/'):request.params.name;
        var re = new RegExp(request.params.name, 'i');
        var filtered = sift({$or: [{name: re}, {key: re}]}, agg.stats);
        return reply(filtered);
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregates',
      handler: function(request, reply){
        statsStore.asArray(request.query, function(err, arr){
          return reply(err||arr);
        });
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregates/{name}',
      handler: function(request, reply){
        var path = request.params.name instanceof Array?request.params.name.join('/'):request.params.name;
        var re = new RegExp(request.params.name, 'i');
        request.query.filter = reformFilter(utils.defaults({$or: [{name: re}, {key: re}]}, request.query.filter));
        statsStore.asArray(request.query, function(err, arr){
          return reply(err||arr);
        });
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregate/{id}',
      handler: function(request, reply){
        request.query.filter = reformFilter(utils.defaults({_id: request.params.id}, request.query.filter));
        statsStore.asArray(request.query, function(err, arr){
          return reply(err||arr[0]);
        });
      }
    },
  ]);

var bus = new Bus(config.bus);

bus.on('started', function(){
  logger.info('Attached to message bus.');
});

bus.on('event', function(data){
  agg.push(data);
});

bus.on('stopped', function(){
  logger.info('Detached from message bus.');
});

bus.start();
