var assert = require('assert');
var TESTS_COLLECTION = 'moca-tests';
var async = require('async');

describe('Store', function(){
  var Store = require('../');
  Store.init({connectionString: 'mongodb://localhost:27017/mocha-tests'});
  describe('General', function(){
    it('Should init with config object', function(done){
      Store.init({connectionString: 'mongodb://localhost:27017/mocha-tests'});
      done();
    });
    it('Should init a store when asked', function(done){
      var test = new Store(TESTS_COLLECTION);
      assert(test);
      done();
    });
    it('Should insert records', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.insert({foo: 'bar 1'}, function(err, rec){
        assert(!err, 'Test store threw an error: '+err);
        var rec = rec[rec.root];
        assert(rec);
        assert(rec._created, 'Created doesn\'t exist');
        assert(rec._id);
        done();
      });
    });
    it('Should be able to retrieve a record by _id', function(done){
      var test = new Store(TESTS_COLLECTION);
      var r = {foo: 'bar 2'};
      test.insert(r, function(err, rec){
        assert(!err, 'Test store threw an error: '+err);
        var rec = rec[rec.root];
        assert(rec, 'Record didn\'t return on insert');
        test.get(rec._id, function(err, rec2){
          assert(!err, 'Test store threw an error: '+err);
          assert(rec2, 'Record didn\'t return on get');
          assert(rec._id.toString() === rec2[rec2.root]._id.toString());
          assert(rec2[rec2.root].foo === r.foo, 'Fetched record does not match inserted record');
          done();
        });
      });
    });
    it('Should be able to update a record by _id', function(done){
      var test = new Store(TESTS_COLLECTION);
      var r = {foo: 'bar 3'};
      test.insert(r, function(err, rec){
        assert(!err, 'Test store threw an error: '+err);
        var rec = rec[rec.root];
        assert(rec, 'Record didn\'t return on insert');
        test.update(rec._id, {bar: 'none', foo: 'bar 3'}, function(err, rec2){
          assert(!err, 'Test store threw an error: '+err);
          var res = rec2[rec2.root];
          assert(res, 'Record didn\'t return on get');
          assert(res._created, 'Created got cleared');
          assert(res._updated, 'Updated doesn\'t exist');
          assert(rec._id.toString() === rec2[rec2.root]._id.toString());
          assert(rec2[rec2.root].foo === r.foo, 'Fetched record does not match inserted record');
          done();
        });
      });
    });
    it('Should be able to list records from a store', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray(null, function(err, res){
        assert(!err, 'Test store threw an error: '+err);
        assert(res.length===3, 'Length is wrong');
        assert(res.count===3, 'Count is wrong');
        done();
      });
    });
    it('Should be able to list records from a store', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray(null, function(err, res){
        assert(!err, 'Test store threw an error: '+err);
        assert(res.length===3, 'Length is wrong');
        assert(res.count===3, 'Count is wrong');
        done();
      });
    });
    it('Should be able to paginate records from a store', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray({offset: 1, limit: 1}, function(err, res){
        assert(!err, 'Test store threw an error: '+err);
        assert(res.length===3, 'Length is wrong');
        assert(res.offset===1, 'Offset is wrong');
        assert(res.limit===1, 'Limit is wrong');
        assert(res.count===1, 'Count is wrong');
        assert(res[res.root][0].foo === 'bar 2', 'Wrong record returned');
        done();
      });
    });
    it('Should be able to filter records from a store', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray({filter: {bar: {$exists: true}}}, function(err, res){
        assert(!err, 'Test store threw an error: '+err);
        assert(res.length===1, 'Length is wrong');
        assert(res.count===1, 'Count is wrong');
        done();
      });
    });
    it('Should be able to filter and paginate records from a store', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray({filter: {bar: {$exists: false}}, offset: 1, limit: 1}, function(err, res){
        assert(!err, 'Test store threw an error: '+err);
        assert(res.length===2, 'Length is wrong');
        assert(res.offset===1, 'Offset is wrong');
        assert(res.limit===1, 'Limit is wrong');
        assert(res.count===1, 'Count is wrong');
        assert(res[res.root][0].foo === 'bar 2', 'Wrong record returned');
        done();
      });
    });
    it('Should be able to delete a record by id',  function(done){
      var test = new Store(TESTS_COLLECTION);
      test.insert({delete: 'me'}, function(err, rec){
        var id = rec[rec.root]._id;
        assert(id, 'Record didn\'t get created');
        test.asArray({filter: {delete: 'me'}}, function(err, result){
          var rec = result[result.root][0];
          assert(rec.delete==='me', 'Got the wrong record');
          test.delete(id, function(err, deleted){
            assert(!err, 'Test store threw an error: '+err);
            assert(deleted, 'Didn\'t get deleted');
            test.asArray({filter: {delete: 'me'}}, function(err, result){
              assert(result.length===0, 'Record said it deleted but didn\'t');
              done();
            });
          });
        });
      });
    });
  });
  describe('Cleanup', function(){
    it('Should let us delete all records', function(done){
      var test = new Store(TESTS_COLLECTION);
      test.asArray(null, function(err, result){
        assert(!err, 'Test store threw an error: '+err);
        var records = result[result.root];
        async.each(records, function(record, next){
          var id = record._id;
          test.delete(id.toString(), function(err, ok){
            assert(ok, 'Record with id of '+id+' did not delete');
            next();
          });
        }, function(){
          test.asArray(null, function(err, result){
            assert(result.length === 0, 'Records didn\'t all get cleaned up');
            done();
          });
        });
      });
    });
  });
});
