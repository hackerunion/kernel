var $ = require('shelljs');
var _ = require('lodash');

var debug = require('debug')('kernel');

module.exports = function(app) {
  var self = {};

  self._init = function() {
    return self;
  };

  self.boot = function() {
    debug("Booting kernel...");
    
    var ret = $.exec(app.get('init') + " boot");

    debug(ret.code ? ("[fail:" + ret.code + "]") : "[ok]", ret.output);
    return ret && !ret.code;
  };

  self.halt = function() {
    debug("Halting kernel...");

    var ret = $.exec(app.get('init') + " halt");

    debug(ret.code ? ("[fail:" + ret.code + "]") : "[ok]", ret.output);
    return ret && !ret.code;
  };
  
  return self._init();
};
