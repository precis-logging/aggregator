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
var Handler = require('./lib/handler').Handler;
var Oplog = require('mongo-oplog');
var Timestamp = require('mongodb').Timestamp;
var Bus = require('./plugins/bus').Bus;

var store = require('./lib/store');
//var Store = require('./plugins/store');
var webroot = path.join(__dirname, (config.web||{}).site||'/webroot');
var server = require('./lib/server');
//var stats = require('./stats.js');
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

var handler = new Handler({
  logger: logger,
  //stats: stats,
  config: config,
  store: store//statsStore
});

var getConversations = function(req, reply){
  store.asArray(req.query, function(err, records){
    return reply(err || records);
  });
};

var getConversation = function(req, reply){
  store.asArray({filter: {conversationId: req.params.id}}, function(err, record){
    return reply(err || record);
  })
};

var getSlowConversations = function(req, reply){
  var options = {filter: {'durations.total': {$gte: parseInt(req.query.duration)||1000}}};
  options = utils.makeFilter(utils.defaults(options, req.query));
  store.asArray(options, function(err, response){
    return reply(err || response);
  });
};

var getConversationsRatio = function(req, reply){
  var since = req.params.start;
  var options = {filter: {'records.time': {$gte: since}}};
  var slowDuration = parseInt(req.query.duration)||1000;

  options = utils.makeFilter(utils.defaults(options, req.query));
  store.asArray(options, function(err, block){
    if(err){
      return reply(err);
    }
    var totalCount = block.length;
    options.filter['durations.total'] = {$gte: slowDuration};
    store.asArray(options, function(err, block){
      if(err){
        return reply(err);
      }
      return reply({
        slow: block.length,
        total: totalCount,
        percent: (block.length/totalCount)*100,
      });
    });
  });
};

var getProcessedCount = function(req, reply){
  return reply(handler.stats);/*{
      inserting: handler.inserting,
      inserted: handler.inserted,
      updating: handler.updating,
      updated: handler.updated,
      processing: handler.processing,
      processed: handler.processed
    });*/
};

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
      path: '/api/v1/conversations',
      handler: getConversations
    },
    {
      method: 'GET',
      path: '/api/v1/conversation/{id}',
      handler: getConversation
    },
    {
      method: 'GET',
      path: '/api/v1/conversations/slow',
      handler: getSlowConversations
    },
    {
      method: 'GET',
      path: '/api/v1/conversations/ratio/{start}',
      handler: getConversationsRatio
    },
    {
      method: 'GET',
      path: '/api/v1/processed',
      handler: getProcessedCount
    },
  ]);

var bus = new Bus(config.bus);

bus.on('started', function(){
  logger.info('Attached to message bus.');
});

bus.on('event', function(data){
  handler.push(data);
});

bus.on('stopped', function(){
  logger.info('Detached from message bus.');
});

bus.start();
