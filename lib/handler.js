var Handler = function(options){
  this.logger = options.logger;
  this.store = options.store;
  this.stats = {
      processing: 0,
      processed: 0,
      inserted: 0,
      inserting: 0,
      updated: 0,
      updating: 0,
      duplicates: 0,
      errors: 0,
    };
};

Handler.prototype.push = function(rec){
  if((!rec.conversationId) || (!rec.duration) || (rec.conversationId === 'Initialize hapi-webapp-groups Mapper')){
    return;
  }
  var stats = this.stats;
  stats.processing++;
  //console.log('record', rec.conversationId);
  var store = this.store;
  var logger = this.logger;
  store.asArray({filter: {conversationId: rec.conversationId}}, function(err, recs){
    if(err){
      stats.processing--;
      stats.errors++;
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
      if(record.durations.total && record.durations.outbound){
        record.durations.overhead = record.durations.total-record.durations.outbound;
      }
      stats.inserting++;
      return store.insert(record, function(err){
        if(err){
          stats.processing--;
          stats.errors++;
          return logger.error(err);
        }
        stats.processing--;
        stats.inserting--;
        stats.inserted++;
        stats.processed++;
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
      if(record.durations.total && record.durations.outbound){
        record.durations.overhead = record.durations.total-record.durations.outbound;
      }
      stats.updating++;
      return store.update(record._id, record, function(err){
        if(err){
          stats.processing--;
          stats.errors++;
          return logger.error(err);
        }
        stats.processing--;
        stats.updating--;
        stats.updated++;
        stats.processed++;
      });
    }
    stats.processing--;
    stats.duplicates++;
  });
};

module.exports = {
  Handler: Handler
};
