var DB = new require('../lib/dummydb').DB;
var reformFilter = new require('../lib/dummydb').reformFilter;
var db = new DB();
var fs = require('fs');
var readline = require('readline');
var Stream = require('stream');
var Aggregator = require('../lib/aggregate').Aggregator;
var Store = require('../plugins/store').Store;
var args = require('../lib/cmdargs')({
              e: 'environment',
              s: 'statfile',
              r: 'rule',
              q: 'query',
              l: 'limit',
              c: 'collection'
            });

var environmentShorts = {
  dev: 'development',
  stg: 'stage',
  prd: 'production'
};

var showUsage = function(){
  console.log('Usage:');
  console.log('  node bulk [options]');
  console.log('');
  console.log('Options:');
  console.log('  --environment, -e - Required, connect to a database instead of using an input file');
  console.log('  --statsfile, -s   - Optional, javascript configuration stats file');
  console.log('  --rule, -r        - Optional, partial match execute rule expression');
  console.log('  --query, -q       - Optional, mongo query to run against the database');
  console.log('  --limit, -l       - Optional, limit the number of records to process');
  console.log('  --collection, -c  - Optional, output collection name');
  console.log('');
  console.log('Sample usage against DB:');
  console.log('  node test -e prd -q \"{time: {\\$gte: \'2015-01-15T00:00:00.000Z\', \\$lt: \'2015-01-15T00:00:10.000Z\'}}\"');
  console.log('  ** NOTE: Don\'t forget \\\'s in front of $\\\'s');
  process.exit(1);
};

if(!args.environment){
  showUsage();
}

process.env.NODE_ENV = args.environment = environmentShorts[args.environment]||args.environment;

var config = require('../lib/config');
var dbConfig = config['mongodb'];
if(!dbConfig.connectionString){
  console.log('\nERROR: Inavlid environment "'+args.environment+'"\n');
  showUsage();
}
var numEntries = 0;

var done = function(store){
  console.log('Processed: '+numEntries);
  store.asArray({limit: 1}, function(err, response){
    console.log('Aggregates: '+response.length);
    console.log('Written to: '+store.collectionName);
    store.db.close();
  });
};

try{
  var RULES = require(args.statfile||args._[1]||'../stats');
  console.log('Stats loaded from: ',args.statfile||args._[1]||'../stats');
}catch(e){
  console.log('Invalid stats file "'+(process.statfile||args._[1]||'../stats')+'"');
  console.log(e);
  if(e.stack){
    console.log(e.stack);
  }
  process.exit(2);
}

if(args.rule){
  var rules = {};
  args.rule = args.rule instanceof Array?args.rule:[args.rule];
  Object.keys(RULES).forEach(function(key){
    args.rule.forEach(function(filter){
      if(key.match(filter)){
        console.log('Using rule:', key);
        rules[key] = RULES[key];
      }
    });
  });
  RULES = rules;
}

var DEFAULT_CONFIG = {
  "connectionString": "mongodb://localhost:27017"+
                      "/log-aggregates",
  "collection": "aggregates"
};

var storeConfig = config['aggregates']||DEFAULT_CONFIG;
storeConfig.collection = args.collection || storeConfig.collection || storeConfig.collectionName;

console.log('Store Config:', JSON.stringify(storeConfig, null, '  '));

new Store(storeConfig, function(err, store){
  var agg = new Aggregator({
    stats: RULES,
    store: store
  });

  var Mongo = require('mongodb');
  var MongoClient = Mongo.MongoClient;
  console.log('Query: ', (args.query||'{}'));
  var query = reformFilter(new Function('', 'return '+(args.query||'{}'))());
  console.log('Connecting to:', dbConfig.connectionString);
  MongoClient.connect(dbConfig.connectionString, function(err, db){
    if(err){
      console.log(err);
      process.exit(3);
    }
    console.log('Connected to:', dbConfig.connectionString);
    db.collection(dbConfig.collection||'logs', function(err, collection){
      if(err){
        console.log(err);
        process.exit(3);
      }

      console.log('Opened:', dbConfig.collection||'logs');
      if(args.query){
        console.log('Executing:', JSON.stringify(query, null, '  '));
      }
      if(args.limit){
        console.log('Limited to:', args.limit);
      }
      var cursor = collection.find(query);//.limit(parseInt(args.limit)||1000);
      if(args.limit && parseInt(args.limit)){
        cursor = cursor.limit(parseInt(args.limit));
      }
      var next = function(){
        cursor.nextObject(function(err, rec){
          if(err){
            console.log(err);
            return process.nextTick(next);
          }

          if(rec){
            numEntries++;
            agg.push(rec);
            if(numEntries % 1000 === 0){
              console.log('Loaded:', numEntries, rec.time.toISOString());
            }
            return process.nextTick(next);
          }

          db.close();
          console.log('Done fetching records.');
          if(agg.processing()){
            return agg.drain(function(){
                done(store);
              });
          }
          done(store);
        });
      }
      next();
    });
  });
});
