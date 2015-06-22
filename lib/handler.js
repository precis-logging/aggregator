var Handler = function(options){
  this.logger = options.logger;
  this.store = options.store;
};

Handler.prototype.push = function(rec){
  if((!rec.conversationId) || (!rec.duration) || (rec.conversationId === 'Initialize hapi-webapp-groups Mapper')){
    return;
  }
  //console.log('record', rec.conversationId);
  var store = this.store;
  var logger = this.logger;
  store.asArray({filter: {conversationId: rec.conversationId}}, function(err, recs){
    if(err){
      return logger.error(err);
    }
    var _id = rec._id.toString();
    var records = recs[recs.root] || [];
    var record = records.shift();
    if(!record){
      record = {
        conversationId: rec.conversationId,
        recordIds: [
          _id
        ],
        durations: {
          total: 0
        },
        records: [
          {
            _id: _id,
            duration: rec.duration,
            level: rec.level,
            msg: rec.msg,
            url: rec.url,
            time: rec.time,
            started: rec.start,
            completed: rec.complete,
            direction: rec.direction,
            server: rec.hostname,
            time: rec.time,
          }
        ],
        size: 1,
        v: 0
      }
      record.durations[rec.direction] = (record.durations[rec.direction]||0)+rec.duration;
      record.durations.total = record.durations.total+rec.duration;
      return store.insert(record, function(err){
        if(err){
          return logger.error(err);
        }
      });
    }
    if(record.recordIds.indexOf(_id)===-1){
      var v = record.v;
      record.recordIds.push(_id);
      record.records.push({
                  _id: _id,
                  duration: rec.duration,
                  level: rec.level,
                  msg: rec.msg,
                  url: rec.url,
                  time: rec.time,
                  started: rec.start,
                  completed: rec.complete,
                  direction: rec.direction,
                  server: rec.hostname,
                  version: rec.appVersion,
                  time: rec.time,
                });
      record.size = record.recordIds.length;
      record.v = record.v + 1;
      record.durations[rec.direction] = (record.durations[rec.direction]||0)+rec.duration;
      record.durations.total = record.durations.total+rec.duration;
      store.update(record._id, record, function(err){
        if(err){
          return logger.error(err);
        }
      });
    }
  });
};

module.exports = {
  Handler: Handler
};
