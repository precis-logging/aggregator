var async = require('async');
var L = require('lambda-30').Lambda;
var sift = require('sift');
var extend = require('./utils').extend;

var DEFAULT_MINUTE_BLOCK_SIZE = 15;

var remove_id = function(source){
  var res = {};
  Object.keys(source).forEach(function(key){
    if(key!=='_id'){
      res[key] = source[key];
    }
  });
  return res;
};

var reformFilter = function(source){
  if((typeof(source) !== 'object')||
     (source instanceof Date)||
     (source instanceof RegExp)||
     (source instanceof Array)){
    return source;
  }
  var res = {};
  Object.keys(source).forEach(function(key){
    var newKey = key.replace(/^\\\$/, '$');
    if(newKey === '_id'){
      return res[newKey] = source[key];
    }
    res[newKey] = reformFilter(source[key]);
  });
  return res;
};

var makeStatFilter = function(stat, enforceExists){
  var res = {};
  var keys = Object.keys(stat);
  keys.forEach(function(key){
    var value = stat[key];
    var type = typeof(value);
    if(key === '$filter'){
      if(enforceExists){
        Object.keys(value).forEach(function(key){
          return res[key]=value[key];
        });
      }
      return;
    }
    if(type==='string'){
      return res[key]=value;
    }
    if(type==='object'){
      if(value.$function&&(!!enforceExists)){
        return res[key] = L(value.$function);
      }
      if(value.$regex){
        value = new RegExp(value.$regex, value.$options||'');
      }
      if((value instanceof RegExp)&&(!!enforceExists)){
        return res[key] = value;
      }
      if(value.field){
        key = value.field;
      }
      if(value.matches){
        return res[key]=value.matches;
      }
      if(enforceExists){
        return res[key]={$exists: true};
      }
    }
  });
  return res;
};

var defaultAggregationHandlers = {
  min: function(c, v){
    if(!c){
      return v;
    }
    if(c > v){
      return v;
    }
    return c;
  },
  max: function(c, v){
    if(!c){
      return v;
    }
    if(c < v){
      return v;
    }
    return c;
  },
  sum: function(c, v){
    if(!c){
      return parseFloat(v)||0;
    }
    return c += parseFloat(v)||0;
  },
  count: function(c){
    if(!c){
      return 1;
    }
    return c+1;
  }
};

var getAggreateFunctions = function(aggregates){
  return aggregates.map(function(agg){
    var type = typeof(agg);
    if(type==='string'){
      if(defaultAggregationHandlers[agg]){
        return {key: agg, f: defaultAggregationHandlers[agg]};
      }
      throw new Error('Unknown aggreagtion type: '+agg);
    }
    if(type==='object'){
      if(typeof(agg.name)==='string'&&typeof(agg.calc)==='function'){
        return {
            key: agg.name,
            f: agg.calc
          };
      }
    }
    return {};
  });
};

var getValue = function(path, src){
  var o = src;
  var parts = path.split('.');
  while(o && parts.length>0){
    o = o[parts.shift()];
  }
  return o;
};

var getStatSteps = function(stat, key, steps, logger){
  var val = stat[key];
  var type = typeof(val);

  if(type==='string'){
    return steps.push(function(src){
      src[key] = val;
    });
  }

  if(type==='object'){
    if(val.as){
      return steps.push(function(src){
        src[key] = val.as;
      });
    }

    if(val.aggregate){
      var aggregates = getAggreateFunctions(val.aggregate instanceof Array?val.aggregate:[val.aggregate]);
      return steps.push(function(src, data){
        var v = getValue(val.field||key, data);
        if(typeof(src[key])!=='object'){
          src[key] = {};
        }
        aggregates.forEach(function(agg){
          if(typeof(agg.f)==='function'){
            try{
              src[key][agg.key] = agg.f(src[key][agg.key], v, data);
            }catch(e){
              logger.error({
                error: e,
                stack: e.stack,
                stat: agg.key,
                f: agg.f.toString(),
                data: data
              });
              throw (e);
            }
          }
        });
      });
    }

    if(val.field){
      return steps.push(function(src, data){
        src[key] = getValue(val.field, data);
      });
    }
  }
};

var makeStatEnricher = function(stat, logger){
  var keys = Object.keys(stat);
  var steps = [];
  keys.forEach(function(key){
    getStatSteps(stat, key, steps, logger);
  });

  return function(src, data){
    var res = extend(true, {}, src);
    steps.forEach(function(step){
      step(res, data);
    });
    return res;
  };
};

var getMinuteBlock = function(fromTime, minutes){
  var timeBlock = new Date(fromTime);
  minutes = minutes&&minutes>0?minutes:DEFAULT_MINUTE_BLOCK_SIZE;
  timeBlock.setSeconds(0);
  timeBlock.setMilliseconds(0);
  timeBlock.setMinutes((~~(timeBlock.getMinutes()/minutes))*minutes);
  return timeBlock;
};

var getDateBlock = function(fromTime){
  var date = new Date(fromTime);
  date.setHours(0);
  date.setMinutes(0);
  return date;
};

var checkAddItem = function(agg, data, nextItem){
  var logError = function(){
    return agg.options.logger.error.apply(agg.options.logger, arguments);
  }.bind(this);
  var logInfo = function(){
    return agg.options.logger.info.apply(agg.options.logger, arguments);
  }.bind(this);

  var matches = [];
  var aData = data instanceof Array?data:[data];
  agg.stats.forEach(function(stat){
    if(sift(stat.recFilter, aData).length>0){
      matches.push(stat);
    }
  });

  if(matches.length===0){
    return process.nextTick(nextItem);
  }

  // Create the entry time member
  var timeBlock = getMinuteBlock(data.time, data.aggregateByMinutes||DEFAULT_MINUTE_BLOCK_SIZE);
  // Create the date entry member
  var date = getDateBlock(timeBlock);

  return async.each(matches, function(match, next){
    var filter = extend(true, {key: match.key, date: date, time: timeBlock}, match.filter);
    var updateRecord = function(filter, retryCount){
      agg.store.asArray({filter: filter}, function(err, records){
        records = records[records.root]||records;
        var rec = (records.length>0)?records[0]:{key: match.key, name: match.name, date: date, time: timeBlock, processed: [], _v: 0};
        var id = rec._id;
        var _v = rec._v;
        rec._v = rec._v + 1;

        if(data._id){
          var srcId = data._id.toString();

          if(rec.processed.indexOf(srcId)>-1){
            if(retryCount){
              logInfo('Already processed on '+retryCount+' try')
            }
            return next();
          }
          rec.processed.push(srcId);
        }
        rec = match.enrich(rec, data);

        if(id){
          var key = {
              _id: id,
              _v: _v
            };
          return agg.store.update(key, rec, function(err){
              if(err){
                logInfo('Retry', key);
                return setImmediate(function(){
                    updateRecord(filter, (retryCount||1)+1);
                  });
              }

              if(retryCount){
                logInfo('Updated on '+retryCount+' try')
              }

              return next();
            });
        }
        return agg.store.insert(rec, function(err, rec){
          if(err){
            logError(err);
          }

          return next();
        });
      });
    };
    updateRecord(filter);

  }, nextItem);
};

var getStatName = function(key, stat){
  if(!stat.name){
    return key.replace(/[^a-z0-9]+/gi, ' ').toLowerCase()
        .replace(/\s(.)/g, function($1) { return $1.toUpperCase(); })
        .replace(/\s/g, '')
        .replace(/^(.)/, function($1) { return $1.toLowerCase(); });
  }
  return stat.name;
};

var Aggregator = function(options){
  var collectStats = options.stats || [];
  var stats = this.stats = [];

  if(!Array.isArray(collectStats)){
    collectStats = Object.keys(collectStats).map(function(key){
      return {
        key: key,
        rule: collectStats[key],
      };
    });
  }

  var logger = this.logger = options.logger;
  this.options = options;
  this.store = options.store;

  collectStats.forEach(this.addAggregate.bind(this));
  logger.info('Loaded aggregates: '+stats.map(function(stat){
    return stat.key;
  }).join(', '));
  var q = this.q = async.queue(function(data, next){
    checkAddItem(this, data, next);
  }.bind(this), 1);
};

Aggregator.prototype.addAggregate = function(agg){
  var info = reformFilter(agg);
  var id = info.id || info._id;
  if(id){
    var idx = this.stats.map(function(stat){
      return stat.id;
    }).indexOf(id);
    if(idx!==-1){
      throw new Error('Aggregate with id of "'+id+'" already exists');
    }
  }
  if(!!info.disabled){
    return;
  }
  info.name = info.name||getStatName(info.key, info.rule);
  var logger = this.logger;
  var _id = info._id.toString();
  var key = info.key;
  var name = info.name;
  var rule = info.rule;
  var stat = {
    id: _id,
    name: name,
    key: key,
    rule: rule,
    stat: info,
    recFilter: makeStatFilter(rule, true),
    filter: makeStatFilter(rule),
    enrich: makeStatEnricher(rule, logger)
  };
  this.stats.push(stat);
  return stat;
};

Aggregator.prototype.findAggregate = function(id){
  var idx = this.stats.map(function(stat){
    return stat.id;
  }).indexOf(id);
  if(idx===-1){
    return false;
  }
  return this.stats[idx];
};

Aggregator.prototype.updateAggregate = function(id, agg){
  var info = reformFilter(agg);
  var idx = this.stats.map(function(stat){
    return stat.id;
  }).indexOf(id);
  if(idx===-1){
    idx = this.stats.length;
  }
  var _id = (info._id||info.id||id).toString();
  var key = info.key;
  var name = info.name;
  var rule = info.rule;
  var logger = this.logger;
  var stat = {
    id: _id,
    name: name||getStatName(key, rule),
    key: key,
    rule: rule,
    stat: info,
    recFilter: makeStatFilter(rule, true),
    filter: makeStatFilter(rule),
    enrich: makeStatEnricher(rule, logger)
  };
  this.stats[idx] = stat;
  return stat;
};

Aggregator.prototype.deleteAggregate = function(id){
  var idx = this.stats.map(function(stat){
    return stat.id;
  }).indexOf(id);
  if(idx===-1){
    return false;
  }
  this.stats.splice(idx, 1);
  return true;
};

Aggregator.prototype.push = function(record){
  this.q.push(record);
};

Aggregator.prototype.processing = function(){
  return this.q.length();
};

Aggregator.prototype.drain = function(handler){
  this.q.drain = handler;
};

module.exports = {
  Aggregator: Aggregator,
  reformFilter: reformFilter
};
