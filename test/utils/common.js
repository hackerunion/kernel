var common = require('../../utils/common');

var app = {};
var req = {};

describe('Common Utilities', function() {
  before('build stub application', function() {
    app.get = sinon.stub();
    app.get.withArgs('root').returns('/test');
    app.common = common(app);
  });

  beforeEach('install mock request', function() {
    req = { 'protocol': 'http', 'originalUrl': '/' };
    req.get = sinon.stub().withArgs('host').returns('user:password@localhost:1337');
  });

  describe('#requestURI()', function() {
    it('should return the same url', function() {
      app.common.requestURI(req).should.equal('http://user:password@localhost:1337/');
    });
  
    it('should build a reasonable url', function() {
      req.originalUrl = '/path/to/example';
      app.common.requestURI(req).should.equal('http://user:password@localhost:1337/path/to/example');
    });
  
    it('should invoke a callback with a url object', function() {
      var callback = sinon.spy();
  
      app.common.requestURI(req, callback);
      expect(callback.calledOnce).to.be.true;
    });

    it('should identify important url features', function() {
      app.common.requestURI(req, function(uri) {
        uri.port.should.equal('1337');
        uri.auth.should.equal('user:password');
        uri.protocol.should.equal(req.protocol + ':');
        uri.host.should.equal(req.get('host').split('@')[1]);
      });
    });

    it('should allow mutation', function() {
      var result = app.common.requestURI(req, function(uri) {
        uri.auth = 'testuser:testpass';
        uri.pathname = '/this/is/a/test';
        uri.search = '?hello=world';
        uri.hash = '#hash';
      });

      result.should.equal('http://testuser:testpass@localhost:1337/this/is/a/test?hello=world#hash');
    });

    it('should not consider both port and host', function() {
      var result = app.common.requestURI(req, function(uri) {
        uri.port = '8888';
      });

      result.should.equal('http://user:password@localhost:1337/');
    });
  });

  describe('#pathToURI()', function() {
    it('should always trim the root path', function() {
      app.common.pathToURI('/test').should.equal('/');
      app.common.pathToURI('/test/hello/world').should.equal('/hello/world');
      app.common.pathToURI('/test/hello/world/').should.equal('/hello/world');
    });

    it('should handle invalid paths gracefully', function() {
      app.common.pathToURI('/hat').should.equal('/hat');
      app.common.pathToURI('/hello/world').should.equal('/hello/world');
      app.common.pathToURI('/').should.equal('/');
    });
  });

  describe('#URItoPath()', function() {
    it('should prepend the root path', function() {
      app.common.URItoPath('/hello/world', '/test/hello/world');
      app.common.URItoPath('hello/world', '/test/hello/world');
      app.common.URItoPath('', '/test');
      app.common.URItoPath('/', '/test');
      app.common.URItoPath('/test', '/test/test');
    });
  });
});
