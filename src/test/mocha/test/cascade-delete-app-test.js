'use strict';

var xquerrailCommon = require('./xquerrailCommon');
var _ = require('lodash');
var assert = require('chai').assert;
var expect = require('chai').expect;
var xml2js = require('xml2js');

var parser = new xml2js.Parser({explicitArray: false});

var parents = [
  {
    'name': xquerrailCommon.random('parent-model-1')
  },
  {
    'name': xquerrailCommon.random('parent-model-2')
  },
  {
    'name': xquerrailCommon.random('parent-model-3')
  }
];

var children = [
  {
    'name': xquerrailCommon.random('child-model-1'),
    'parent': [parents[0].name]
  },
  {
    'name': xquerrailCommon.random('child-model-2'),
    'parent': [parents[0].name, parents[1].name]
  },
  {
    'name': xquerrailCommon.random('child-model-3'),
    'parent': [parents[1].name, parents[2].name]
  },
  {
    'name': xquerrailCommon.random('child-model-4'),
    'parent': [parents[1].name]
  }
];

var searchFetch = function (model, data, callback) {
  xquerrailCommon.model.search(model, data, function(error, response, entity) {
    expect(response.statusCode).to.equal(200);
    var total = entity.response.total;
    var pageSize = entity.response['page_length'];
    var items = [];
    _.each(entity.response.results, function(item, index) {
      xquerrailCommon.model.get(model, {'uri': item.uri}, function(error, response, entity) {
        expect(response.statusCode).to.equal(200);
        items.push(entity);
        if (Math.min(total, pageSize) === index + 1) {
          callback(items);
        }
      });
    });
  });
};

var getItem = function(model, name, callback) {
  xquerrailCommon.model.get(model, {'name': name}, function(error, response, entity) {
    expect(response.statusCode).to.equal(200);
    expect(entity.name).to.equal(name);
    callback(entity);
  });
};
var deleteAll = function(callback) {
  xquerrailCommon.model.removeAll('parent-model', function(error, response) {
    expect(response.statusCode).to.equal(204);
    xquerrailCommon.model.removeAll('child-model', function(error, response) {
      expect(response.statusCode).to.equal(204);
      callback()
    });
  });
};

var createAll = function(model, items, callback) {

  var create = function(model, items, index, cb) {
    if (items.length === index + 1) {
      cb();
    } else {
      xquerrailCommon.model.create(model, items[index], function(error, response, entity) {
        expect(response.statusCode).to.equal(200);
        create(model, items, index+1, cb);
      });
    }
  };

  create(model, items, 0, callback);



  // _.each(items, function(item, index) {
  //   xquerrailCommon.model.create(model, item, function(error, response, entity) {
  // //     expect(response.statusCode).to.equal(200);
  // //     getItem(model, item.name, function() {
  //       if (items.length === index + 1) {
  //         callback();
  //       }
  // //     })
  //   });
  // });
};

describe('Cascade delete features', function() {

  before(function(done) {
    xquerrailCommon.initialize(function(error, response, body) {
      expect(response.statusCode).to.equal(200);
      xquerrailCommon.login(function(error, response, body) {
        done();
      });
    }, module.filename);
  });

  describe('cascade', function() {
    beforeEach(function(done) {
      // console.time('deleteAll');
      // deleteAll(function() {
            // console.timeEnd('deleteAll');
            console.time('createAll');
        createAll('parent-model', parents, function() {
          console.timeEnd('createAll');
          createAll('child-model', children, function() {
            done();
          });
        });
      // });
    });

    afterEach(function(done) {
      console.time('deleteAll');
      deleteAll(function() {
            console.timeEnd('deleteAll');
            done();
      });

    });

    xit('should just work', function(done) {
      _.each(children, function(child) {
        console.dir(child);
      });
      done();
    });
    it('remove - should delete parent and referenced child', function(done) {
      var parentName = parents[0].name;
      xquerrailCommon.model.remove('parent-model', {'_cascade': 'remove', 'name': parentName}, function(error, response, entity) {
        expect(response.statusCode).to.equal(200);
        expect(entity.name).to.equal(parentName);
        var referencedChildren = _.filter(
          children,
          function(child) { return (child.parent === parentName || child.parent.indexOf(parentName) > -1); }
        );
        _.each(referencedChildren, function (child, index) {
          xquerrailCommon.model.get('child-model', {'name': child.name}, function(error, response, entity) {
            expect(response.statusCode).to.equal(404);
            if (referencedChildren.length === index + 1) {
              done();
            }
          });
        });
      });
    });

    it('detach - should delete parent and referenced child', function(done) {
      var parentName = parents[1].name;
      searchFetch('child-model', {'parent.text': parentName}, function(referencedChildren) {
        xquerrailCommon.model.remove('parent-model', {'_cascade': 'detach', 'name': parentName}, function(error, response, entity) {
          expect(response.statusCode).to.equal(200);
          expect(entity.name).to.equal(parentName);
          _.each(referencedChildren, function (child, index) {
            xquerrailCommon.model.get('child-model', {'name': child.name}, function(error, response, entity) {
              expect(response.statusCode).to.equal(200);
              _.each(child.parent, function(parent) {
                expect(parent.text).not.to.equal(parentName);
              });
              if (referencedChildren.length === index + 1) {
                done();
              }
            });
          });
        });
      });
    });

    xit('no cascade - should not delete parent', function(done) {
      var parentName = parents[2].name;
      searchFetch('child-model', {'parent.text': parentName}, function(referencedChildren) {
        xquerrailCommon.model.remove('parent-model', {'name': parentName}, function(error, response, entity) {
          expect(response.statusCode).to.equal(500);
          expect(error.name).to.equal('REFERENCE-CONSTRAINT-ERROR');
          _.each(referencedChildren, function (child, index) {
            xquerrailCommon.model.get('child-model', {'name': child.name}, function(error, response, entity) {
              expect(response.statusCode).to.equal(200);
              if (referencedChildren.length === index + 1) {
                xquerrailCommon.model.get('parent-model', {'name': parentName}, function(error, response, entity) {
                  expect(response.statusCode).to.equal(200);
                  done();
                });
              }
            });
          });
        });
      });
    });

  });

});
