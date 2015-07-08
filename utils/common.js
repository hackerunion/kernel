var url = require('url');
var path = require('path');
var _ = require('lodash');

module.exports = function(app) {
  var self = {};

  self.init = function() {
    return self;
  };

  self.requestURI = function(req, func, orig) {
    var uri = url.parse(req.protocol + '://' + req.get('host') + (orig || req.originalUrl));
    
    if (func) {
      func(uri);
    }

    return url.format(uri);
  };

  self.pathToURI = function(p) {
    return path.normalize(path.join('/', path.relative(app.get('root'), p)));
  };

  self.URItoPath = function(u) {
    return path.join(app.get('root'), u);
  };

  return self.init();
};
