var Aggregator = require('./lib/aggregator').Aggregator;
var reformFilter = require('./lib/aggregator').reformFilter;
var Joi = require('joi');
var utils = require('./lib/utils');
var isTrue = utils.isTrue;
var defaults = utils.defaults;
var path = require('path');

var fetchAll = function(from, callback){
  var results = [];
  var fetchBlock = function(offset){
    setImmediate(function(){
      from.asArray({offset: offset}, function(err, records){
        if(err){
          return callback(err);
        }
        if(records[records.root] && records[records.root].length){
          results = results.concat(records[records.root]);
          return fetchBlock(offset+records[records.root].length);
        }
        return callback(null, results);
      });
    });
  };
  fetchBlock(0);
};

var encodeRecord = function(rec, _idOk){
  if(typeof(rec)!=='object' || !rec){
    return rec;
  }
  if(Array.isArray(rec)){
    return rec.map(function(item){
      return encodeRecord(item, true);
    });
  }
  var res = {};
  Object.keys(rec).forEach(function(key){
    if((key === '_id') && (!_idOk)){
      return;
    }
    var newKey = key.replace(/^\$/, '\\$').replace(/\./g, '__dot__');
    res[newKey] = encodeRecord(rec[key]);
  });
  return res;
};

var notDeleted = function(rec){
  return !rec.deleted;
};

var listAggregatesHandler = function(req, reply){
  var getStats = function(){
    return this.handler.stats.map(function(info){
      return info.stat;
    });
  };
  if(isTrue(utils.defaults({all: true}, req.query).all)){
    return this.statsStore.asArray(req.query, function(err, records){
      if(err){
        return reply(err.toString());
      }
      records[records.root] = records[records.root].map(reformFilter);
      return reply(records);
    });
  }
  var offset = parseInt(req.query.offset)||false;
  var limit = parseInt(req.query.limit)||false;
  var stats = getStats.call(this);
  var res = {
    root: 'stats',
    stats: stats,
    offset: 0,
    limit: stats.length,
    length: stats.length,
    count: stats.length
  };
  if(offset){
    res.offset = offset;
    res.stats = res.stats.slice(offset);
  }
  if(limit){
    res.limit = limit;
    res.stats = res.stats.slice(0, limit);
  }
  return reply(res);
};

var getAggregateHandler = function(req, reply){
  var id = req.params.id;
  var agg = this.handler.findAggregate(id);
  if(!agg){
    return this.statsStore.get(id, function(err, record){
      if(err){
        return reply(err);
      }
      if(record && record[record.root]){
        return reply(reformFilter(record[record.root]));
      }
      return reply(false);
    });
  }
  return reply(agg.stat);
};

var insertAggregateHandler = function(req, reply){
  var stat = encodeRecord(req.payload);
  this.statsStore.insert(stat, function(err, record){
    if(err){
      return reply(err.toString());
    }
    var agg = record[record.root];
    this.sockets.emit('aggregators::update', agg);
    return reply(this.handler.addAggregate(agg).stat);
  }.bind(this));
};

var updateAggregateHandler = function(req, reply){
  var id = req.params.id;
  var agg = encodeRecord(req.payload);
  this.statsStore.update(id, agg, function(err, rec){
    if(err){
      return reply(err.toString());
    }
    var agg = rec[rec.root];
    this.handler.updateAggregate(id, agg);
    this.sockets.emit('aggregators::update', agg);
    return reply(agg);
  }.bind(this));
};

var deleteAggregateHandler = function(req, reply){
  var id = req.params.id;
  this.statsStore.get(id, function(err, res){
    if(err){
      return reply(err);
    }
    var agg = res[res.root];
    if(!agg){
      return reply(false);
    }
    agg.deleted = true;
    this.statsStore.update(id, encodeRecord(agg), function(err, rec){
      if(err){
        return reply(err.toString());
      }
      this.handler.deleteAggregate(id);
      this.sockets.emit('aggregators::update', agg);
      return reply(agg);
    }.bind(this));
  }.bind(this));
};

var getAggregatesRecordsHandler = function(req, reply){
  var opts = req.query || {};
  this.aggregatesStore.asArray(opts, function(err, records){
    if(err){
      return reply(err.toString());
    }
    return reply(records);
  });
};

var getAggregateRecordsHandler = function(req, reply){
  var key = req.params.keyOrName;
  var opts = defaults({filter: {$or: [{key: key}, {name: key}]}}, req.query);
  this.aggregatesStore.asArray(opts, function(err, records){
    if(err){
      return reply(err.toString());
    }
    return reply(records);
  });
};

var routes = function(){
  return [
    {
      method: 'GET',
      path: '/api/v1/aggregators',
      config: {
        description: 'Get list of aggregates in use',
        tags: ['api'],
        validate: {
          query: {
            all: Joi.boolean().optional(),
            offset: Joi.number().optional(),
            limit: Joi.number().min(1).max(10000).optional(),
            ts: Joi.any().optional(),
          },
        },
        handler: listAggregatesHandler.bind(this)
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregator/{keyOrName}/records',
      config: {
        description: 'Get aggregates for {keyOrName}',
        tags: ['api'],
        validate: {
          params: {
            keyOrName: Joi.string().required(),
          },
          query: {
            offset: Joi.number().optional(),
            limit: Joi.number().min(1).max(10000).optional(),
            ts: Joi.any().optional(),
            filter: Joi.any().optional(),
            sort: Joi.any().optional(),
          },
        },
        handler: getAggregateRecordsHandler.bind(this)
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregates',
      config: {
        description: 'Get aggregates',
        tags: ['api'],
        validate: {
          query: {
            offset: Joi.number().optional(),
            limit: Joi.number().min(1).max(10000).optional(),
            ts: Joi.any().optional(),
            filter: Joi.any().optional(),
            sort: Joi.any().optional(),
          },
        },
        handler: getAggregatesRecordsHandler.bind(this)
      }
    },
    {
      method: 'GET',
      path: '/api/v1/aggregator/{id}',
      config: {
        description: 'Get aggregate {id}',
        tags: ['api'],
        validate: {
          params: {
            id: Joi.string().required(),
          },
          query: {
            ts: Joi.any().optional(),
          },
        },
        handler: getAggregateHandler.bind(this)
      }
    },
    {
      method: 'POST',
      path: '/api/v1/aggregator',
      config: {
        description: 'Create a new aggregator',
        tags: ['api'],
        validate: {
          payload: Joi.object().required(),
        },
        handler: insertAggregateHandler.bind(this)
      }
    },
    {
      method: 'POST',
      path: '/api/v1/aggregator/{id}',
      config: {
        description: 'Update the aggregate {id}',
        tags: ['api'],
        validate: {
          params: {
            id: Joi.string().required(),
          },
          payload: Joi.object().required(),
        },
        handler: updateAggregateHandler.bind(this)
      }
    },
    {
      method: 'DELETE',
      path: '/api/v1/aggregator/{id}',
      config: {
        description: 'Delete the aggregate {id}',
        tags: ['api'],
        validate: {
          params: {
            id: Joi.string().required(),
          },
        },
        handler: deleteAggregateHandler.bind(this)
      }
    },
  ];
};

var registerUi = function(){
  return [
    {
      pages: [
        {
          route: '/aggregators',
          title: 'Aggregators',
          name: 'Aggregators',
          section: 'Aggregations',
          filename: path.resolve(__dirname, 'ui/aggregators.jsx'),
        },
        {
          route: '/aggregates',
          title: 'Aggregates',
          name: 'Aggregates',
          section: 'Aggregations',
          filename: path.resolve(__dirname, 'ui/aggregates.jsx'),
        },
        {
          route: '/reports',
          title: 'Reports',
          name: 'Reports',
          section: 'Aggregations',
          filename: path.resolve(__dirname, 'ui/reports.jsx'),
        },
        {
          route: '/report/:name',
          name: 'RunReport',
          filename: path.resolve(__dirname, 'ui/report.jsx'),
        },
        {
          route: '/report/:name/edit',
          name: 'EditReport',
          filename: path.resolve(__dirname, 'ui/report.jsx'),
        },
        {
          route: '/report',
          name: 'CreateReport',
          filename: path.resolve(__dirname, 'ui/report.jsx'),
        },
      ]
    },
    {
      components: [
        {
          name: 'AggregatorsDashboard',
          filename: path.resolve(__dirname, 'ui/dashboard.jsx'),
        },
      ],
    },
    {
      stores: [
        {
          name: 'Aggregators',
          socketEvent: {
            event: 'aggregators::update',
            prefetch: '/api/v1/aggregators',
          }
        }
      ]
    },
  ];
};

var Plugin = function(options){
};

Plugin.prototype.init = function(options){
  var logger = options.logger;
  var config = options.config || {};
  var server = options.server;
  var ui = options.ui;
  var sockets = this.sockets = options.sockets;

  var aggregatesStore = this.aggregatesStore = options.stores.get(config.aggregatesStoreName||'aggregates');
  var statsStore = this.statsStore = options.stores.get(config.statsStoreName||'aggregate_stats');

  fetchAll(this.statsStore, function(err, stats){
    this.stats = stats;
    this.handler = new Aggregator({
      logger: logger,
      store: aggregatesStore,
      stats: stats.filter(notDeleted),
    });
  }.bind(this));
};

Plugin.prototype.register = function(options){
  var register = options.register;
  register({
    proxy: options.proxy,
    ui: registerUi.call(this),
    server: routes.call(this)
  });
};

Plugin.prototype.push = function(record){
  if(!this.handler){
    return setImmediate(function(){
      this.push(record);
    }.bind(this));
  }
  this.handler.push(record);
};

module.exports = Plugin;
