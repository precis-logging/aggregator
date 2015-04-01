try{
  var mongodb = require('mongodb');
}catch(e){
  console.error('MongoDB is NOT installed, please "npm install mongodb" to use this module');
  throw e;
}
var MongoClient = mongodb.MongoClient;
var ObjectId = mongodb.ObjectID;

var reTrue = /^(true|t|yes|y|1)$/i;
var reFalse = /^(false|f|no|n|0)$/i;

var isTrue = function(value){
  return !!reTrue.exec(''+value);
};

var isFalse = function(value){
  return !!reFalse.exec(''+value);
};

var isNumeric = function(n){
  return !isNaN(parseFloat(n)) && isFinite(n);
};

var getMonday = function(d){
  d = new Date(d);
  var day = d.getDay(),
      diff = d.getDate() - day + (day == 0 ? -6:1); // adjust when day is sunday
  return new Date(d.setDate(diff));
};

var reformValues = function(on){
  if(on === void 0){
    return on;
  }
  var res = {};
  var keys = Object.keys(on), l = keys.length, i, key, value;
  for(i=0; i<l; i++){
    key = keys[i];
    value = on[key];
    if(isNumeric(value)){
      res[key] = +value;
    }else if(isTrue(value)){
      res[key] = true;
    }else if(isFalse(value)){
      res[key] = false;
    }else if(typeof(value)==='object'){
      if(value !== null && value !== void 0){
        res[key] = reformValues(value);
      }
    }else{
      res[key] = value;
    }
  }
  return res;
};

var reformSort = function(on){
  if(on === void 0){
    return on;
  }
  var res = {};
  var keys = Object.keys(on), l = keys.length, i, key, value;
  for(i=0; i<l; i++){
    key = keys[i];
    value = on[key];
    if(isNumeric(value)){
      res[key] = +value;
    }else if(isTrue(value)){
      res[key] = true;
    }else if(isFalse(value)){
      res[key] = false;
    }else if(typeof(value)==='object'){
      if(value !== null && value !== void 0){
        res[key] = reformValues(value);
      }
    }else{
      res[key] = true;
    }
  }
  return res;
};

var utils = require('./utils');

var isNumeric = function (n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
};

var _config = {};

var Store = module.exports = function(options, callback){
  var self = this;
  var hasOptions = typeof(options) === 'object';
  var collectionName = hasOptions ? options.collectionName || options.collection : options;
  var defaultConnectionString = _config.connectionString || process.env.MONGO_CONNECTIONSTRING;
  var connectionString = hasOptions ? options.connectionString || defaultConnectionString : defaultConnectionString;
  self.collectionName = collectionName;
  self._opened = false;
  MongoClient.connect(connectionString, function(err, db){
    if(err){
      if(typeof(callback)==='function'){
        return callback(err);
      }
      throw new Error(err);
    }
    self.db = db;
    self._opened = true;
    self.db.writeConcern = self.db.writeConcern||'majority';
    if(typeof(callback)==='function'){
      return callback(null, self);
    }
  });
};

Store.init = function(config){
  _config = config;
};

var updateFilterIds = module.exports.updateFilterIds = function(root){
  var keys = Object.keys(root), i, l=keys.length, key, value;
  for(i=0; i<l; i++){
    key = keys[i];
    if(key.match(/\_id$/)){
      try{
        root[key] = ObjectId(root[key]);
      }catch(e){
      }
    }else{
      switch(typeof(root[key])){
        case('object'):
          updateFilterIds(root[key]);
          break;
        case('string'):
          // DateTime String: 2013-08-17T00:00:00.000Z
          if(root[key].match(/^\d{4}\-\d{2}\-\d{2}T\d{2}\:\d{2}\:\d{2}\.\d{3}Z$/i)){
            root[key] = new Date(root[key]);
          }else{
            switch(root[key].toLowerCase()){
              case("$today"):
                root[key] = new Date();
                root[key].setHours(0, 0, 0, 0);
                break;
              case("$yesterday"):
                root[key] = new Date();
                root[key].setDate(root[key].getDate() - 1);
                root[key].setHours(0, 0, 0, 0);
                break;
              case("$thisweek"):
                root[key] = getMonday(new Date());
                break;
              case("$thismonth"):
                root[key] = new Date();
                root[key].setDate(1);
                root[key].setHours(0, 0, 0, 0);
                break;
              case("$thisyear"):
                root[key] = new Date();
                root[key].setMonth(1);
                root[key].setDate(1);
                root[key].setHours(0, 0, 0, 0);
                break;
            }
          }
        default:
          var value = root[key];
          if(isNumeric(value)){
            root[key] = +value;
            break;
          }
          if(isTrue(value)){
            root[key] = true;
            break;
          }
          if(isFalse(value)){
            root[key] = false;
            break;
          }
      }
    }
  }
  return root;
};

Store.prototype.collection = function(callback, collectionCallback){
  var self = this;
  if(!self._opened){
    return setTimeout(function(){
      return self.collection(callback, collectionCallback);
    }, 100);
  }

  self.db.collection(self.collectionName, function(err, collection){
    if(err){
      return callback(err);
    }
    return collectionCallback(collection);
  });
};

Store.prototype.get = function(_id, callback){
  var self = this;
  self.collection(callback, function(collection){
    var filter = updateFilterIds(((typeof(_id)==='object')&&(!(_id instanceof ObjectId)))?_id:{_id: ObjectId(_id)});
    collection.find(filter, function(err, cursor){
      if(err){
        callback(err);
      }else{
        cursor.toArray(function(err, records){
          if(err){
            callback(err);
          }else{
            var response = {
              root: self.collectionName
            };
            if(records.length>1){
              response = {
                root: self.collectionName,
                length: records.length,
                count: records.length,
                offset: 0,
                limit: records.length
              }
              response[self.collectionName] = records;
            }else{
              response[self.collectionName] = records[0];
            }
            callback(null, response);
          }
        });
      }
    });
  });
};

Store.prototype.insert = function(record, callback, noRetry){
  var self = this;
  self.collection(callback, function(collection){
    record._created = new Date();
    collection.insert(record, self.db.writeConcern, function(err, responseRecord){
      if(err&&(err.err === "norepl")&&(err.wnote === 'no replication has been enabled, so w=2+ won\'t work')){
        self.db.writeConcern = 1;
        return self.insert(record, callback);
      }
      if(err && !noRetry){
        return callback(err);
      }
      if(err){
        return self.insert(record, callback, true);
      }
      return callback(null, {root: 'record', record: responseRecord.ops instanceof Array?responseRecord.ops[0]:responseRecord.ops});
    });
  });
};

Store.prototype.update = function(_id, record, callback){
  var self = this;
  var findKey;
  if(typeof(record)==='function'){
    callback = record;
  }
  if(typeof(_id)==='object' && (!_id instanceof ObjectId)){
    record = _id;
    _id = record._id;
  }
  if(_id===void 0||_id===''||_id===false||_id===null){
    _id = (record||{})._id||false;
  }
  if((!!_id)!==false){
    try{
      findKey = _id instanceof ObjectId?{_id: _id}:{_id: ObjectId(_id)};
    }catch(e){
      if(typeof(_id) === 'object'){
        findKey = _id;
      }else{
        throw e;
      }
    }
  }else{
    findKey = utils.extend(true, {}, record.$set||record);
  }
  delete (record.$set||{})._id;
  delete record._id;
  record._updated = new Date();
  self.get(_id, function(err, rec){
    if(err){
      return callback(err);
    }
    if(!rec[rec.root]){
      return callback(new Error('Invalid record _id specified'));
    }
    record._created = rec[rec.root]._created;
    self.collection(callback, function(collection){
      collection.findAndModify(findKey, {$natural: -1}, record, {upsert: true, 'new': true}, function(err, srcRecord){
        if(srcRecord && srcRecord.value){
          try{
            srcRecord._id = srcRecord.value._id||((!!_id)!==false)?(_id instanceof ObjectId?_id:ObjectId(_id)):null;
          }catch(e){
          }
        }
        callback(err, {root: 'record', record: srcRecord.value||srcRecord});
      });
    });
  });
};

Store.prototype.asArray = function(opts, callback){
  var self = this;
  var options = opts || {};
  self.collection(callback, function(collection){
    var cursor;
    options.skip=parseInt(options.offset)||0;
    options.limit=parseInt(options.limit)||100;
    if(options.filter && !options.dontReformFilter){
      options.filter = updateFilterIds(options.filter);
    }
    var findOptions = {
      fields: options.fields,
    };
    if(options.sort){
      findOptions.sort = reformSort(options.sort);
    }
    cursor = collection.find(options.filter, findOptions);
    cursor.count(function(err, count){
      if(options.limit){
        cursor = cursor.limit(options.limit);
      }
      if(options.skip){
        cursor = cursor.skip(options.skip);
      }
      cursor.toArray(function(err, arr){
        var response;
        if(err){
          return callback(err);
        }
        response = {
          length: count,
          count: arr.length,
          limit: options.limit||arr.length,
          offset: options.skip||0,
          root: self.collectionName,
        };
        response[self.collectionName] = arr;
        callback(null, response);
      });
    });
  });
};

Store.prototype.upsert = function(key, record, callback){
  var self = this;
  var findKey;
  record = utils.extend(record.$set?record:{$set: record});
  if(typeof(record)==='function'){
    callback = record;
  }
  if(typeof(_id)==='object' && (!_id instanceof ObjectId)){
    record = _id;
    _id = record._id;
  }
  if(_id===void 0||_id===''||_id===false||_id===null){
    _id = (record||{})._id||false;
  }
  if((!!_id)!==false){
    try{
      findKey = _id instanceof ObjectId?{_id: _id}:{_id: ObjectId(_id)};
    }catch(e){
      if(typeof(_id) === 'object'){
        findKey = _id;
      }else{
        throw e;
      }
    }
  }else{
    findKey = utils.extend(true, {}, record.$set||record);
  }
  delete (record.$set||{})._id;
  delete record._id;
  self.collection(callback, function(collection){
    collection.findAndModify(findKey, {$natural: -1}, record, {upsert: true, 'new': true}, function(err, srcRecord){
      if(srcRecord){
        try{
          srcRecord._id = srcRecord._id||((!!_id)!==false)?(_id instanceof ObjectId?_id:ObjectId(_id)):null;
        }catch(e){
        }
      }
      callback(err, srcRecord);
    });
  });
};

Store.prototype.delete = function(_id, callback){
  var self = this;
  var key = _id instanceof ObjectId?{_id: _id}:{_id: ObjectId(_id)};
  self.collection(callback, function(collection){
    collection.remove(key, callback);
  });
};

Store.prototype.ensure = function(record, callback){
  var self = this;
  self.asArray({filter: record}, function(err, recs){
    if(err){
      return callback(err);
    }
    recs = recs[recs.root];
    if((!recs)||recs.length==0){
      self.insert(record, callback);
    }else{
      callback(null, recs[0]);
    }
  });
};
