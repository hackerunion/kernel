var mock = require('mock-fs');
var env = require('../../env');
var fs = require('fs');
var app = null;

describe('hooks', function() {
  before('set up test environment variables', function() {
    env.install();
    app = require('../../../app');
  });
  
  beforeEach('build fake filesystem', function() {
    mock({
      '/test': {
        'var/run/kernel': {},
        'etc': {},
        'sbin': {},
        'var/www': {},
        'README': 'you suck'
      }
    });
  });

  afterEach('destroy fake filesystem', function() {
    mock.restore();
  });

  after('tear down test environment variables', function() {
    env.restore();
  });
});
