var url = require('url');
var path = require('path');
var _ = require('lodash');

module.exports = function(app) {
  var self = {};

  self.init = function() {
    return self;
  };

  self.requestURI = function(req, func) {
    var uri = url.parse(req.protocol + '://' + req.get('host') + req.originalUrl);
    
    if (func) {
      func(uri);
    }

    return url.format(uri);
  };

  self.pathToURI = function(p) {
    return '/' + p.replace(RegExp('^/?' + path.join(app.get('root'), '/')), '');
  };

  self.URItoPath = function(u) {
    return path.join(app.get('root'), u);
  }

  return self.init();
};
