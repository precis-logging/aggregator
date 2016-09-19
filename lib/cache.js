/*
  TODO: Resolve locking issue:
    * When record doesn't exist and multiple of the same record type are asked
      for at the same time there is a race condition that allows multiple new's
      to happen and queue up
    * Move the lock outside the CacheItem constructor
    * Write Lock the array of items
    * Read from the DB
    * Check the results, if a record exists create a new CacheItem
    * If no record exists then create a new CacheItem
    * Release the lock
*/

var debug_log = [];
var queueStatus = require('./queuestatus');

var debug = function(){
  debug_log.push(Array.prototype.slice.call(arguments));
  var offset = Math.max(debug_log.length-100, 0);
  debug_log = debug_log.slice(offset, 100);
  if(queueStatus.depth>1000){
    console.log(debug_log);
    debug_log = [];
  }
};

var sift = require('sift');
var async = require('async');
var locks = require('locks');

var __id = 0;
var CacheItem = function(data, cache){
  this.data = data;
  this._dirty = false;
  this._cache = cache;
  this.id = __id++;
  this._lock = locks.createMutex();
  this.touch();
  cache.items.push(this);
};

CacheItem.prototype.touch = function(){
  this._touched = (new Date()).getTime();
};

CacheItem.prototype.unlock = function(){
  var e = new Error('Attempt to release a CacheItem lock when not in a lock');
  console.error(e);
  console.error(e.stack);
};

CacheItem.prototype.lock = function(name, callback){
  var e = new Error();
  var id = this.id;
  debug('CacheItem.lock', id, name, e.stack)
  var _lock = this._lock;
  _lock.lock(function(){
    this.unlock = function(dirty){
      debug('CacheItem.unlock', id, name)
      this.touch();
      this._dirty = typeof(dirty)==='boolean'?dirty:true;
      _lock.unlock();
    };
    return callback(null, this);
  }.bind(this));
};

CacheItem.prototype.flush = function(){
  this._dirty = false;
};

var Cache = function(options){
  options = options || {};
  var expiryTime = typeof(options.expiryTime)==='number'?options.expiryTime:60000;
  var flushCheck = typeof(options.flushCheckTime)==='number'?options.flushCheckTime:1000;
  var store = options.store;
  this.items = [];
  this.store = store;
  this.expiryTime = expiryTime;
  this.flushCheck = flushCheck;
  this._lock = locks.createMutex();
  this.init();
};

Cache.prototype.init = function(){
  this._ready = true;
  return this.setTimer();
/*
  this.loadRecords(function(){
    this._ready = true;
    this.setTimer();
  }.bind(this));
  //*/
};

Cache.prototype.unlock = function(){
  var e = new Error('Attempt to release a Cache lock when not in a lock');
  console.error(e);
  console.error(e.stack);
};

Cache.prototype.lock = function(name, callback){
  debug('Cache.lock', name)
  var _lock = this._lock;
  _lock.lock(function(){
    this.unlock = function(){
      debug('Cache.unlock', name)
      _lock.unlock();
    };
    return callback(null, this);
  }.bind(this));
};

Cache.prototype.loadRecords = function(callback){
  var nextBlock = function(offset){
    var today = new Date();
    var daysAgo = ((1000 * 60 * 60) * 24) * 3;
    var cacheAtLeast = new Date(today.getTime() - daysAgo);
    this.store.asArray({offset: offset, limit: 1000, filter: {date: {$gte: cacheAtLeast}}}, function(err, response){
      if(err){
        return setImmediate(function(){
          nextBlock(offset);
        }.bind(this));
      }

      var records = response[response.root];
      records.forEach(function(record){
        new CacheItem(record, this);
      }.bind(this));

      if(records.length){
        return setImmediate(function(){
          nextBlock(response.offset+records.length);
        }.bind(this));
      }
      return done();
    }.bind(this));
  }.bind(this);

  var done = function(){
    return callback();
  };

  nextBlock(0);
};

Cache.prototype.setTimer = function(){
  if(this._timer){
    return;
  }
  this._timer = setTimeout(function(){
    this._timer = false;
    this.flushChanges();
  }.bind(this), this.flushCheck)
};

Cache.prototype.checkStale = function(){
  var now = (new Date()).getTime();
  var olderThan = (new Date(now-this.expiryTime)).getTime();
  var notCleanable = function(item){
    var alive = +(olderThan - item._touched) || 0;
    if(item._dirty){
      return true;
    }
    if(alive < 1){
      return true;
    }
    return false;
  };

  return this.lock('checkStale', function(){
    var l = this.items.length;
    this.items = this.items.filter(notCleanable);
    if(l - this.items.length > 0){
      debug('Cleaned', l - this.items.length)
    }
    this.unlock();
    return this.setTimer();
  }.bind(this));
};

Cache.prototype.flushChanges = function(){
  var store = this.store;
  var actionable = function(item){
    return item && item._dirty;
  };

  var done = function(){
    return this.checkStale();
  }.bind(this);

  var updateItem = function(item, next){
    var record = Object.assign({}, item.data);
    store.update(record._id, record, function(err){
      item.touch();
      return next(err);
    });
  };

  var insertItem = function(item, next){
    var record = Object.assign({}, item.data);
    store.insert(record, function(err, response){
      item.touch();
      if(!err){
        var newRec = response.root?response[response.root]:response;
        item.data._id = newRec._id;
      }
      return next(err);
    });
  };

  var processItem = function(item, next){
    var itemDone = function(err){
      var isDirty = !!err;
      item.unlock(isDirty);
      return next();
    };

    item.lock('processItem', function(){
      var hasId = !!item.data._id;
      if(hasId){
        return updateItem(item, itemDone);
      }
      return insertItem(item, itemDone);
    });
  };

  var changes = this.items.filter(actionable);
  async.each(changes, processItem, done);
};

Cache.prototype.get = function(filter, callback){
  if(!this._ready){
    return setImmediate(function(){
      return this.get(filter, callack);
    }.bind(this));
  }
  var store = this.store;

  var done = function(err, item){
    this.unlock();
    if(err){
      return callback(err);
    }
    item.lock('get', function(){
      return callback(null, item);
    });
  }.bind(this);

  var createNew = function(){
    var record = Object.assign({}, filter);
    return done(null, new CacheItem(record, this));
  }.bind(this);

  var getData = function(item){
    return item.data;
  };

  var getIndex = function(){
    return sift.indexOf(filter, this.items.map(getData));
  }.bind(this);

  var attemptLoadOrCreate = function(){
    store.asArray({filter: filter}, function(err, response){
      if(err){
        return done(err);
      }

      var records = response.root?response[response.root]:response;
      var record = Array.isArray(records)?records[0]:records;

      if(!record){
        return createNew();
      }

      return done(null, new CacheItem(record, this));
    }.bind(this));
  }.bind(this);

  this.lock('get::scan', function(){
    var index = getIndex();
    if(index > -1){
      return done(null, this.items[index]);
    }

    return attemptLoadOrCreate();
  }.bind(this));
};

module.exports = Cache;
