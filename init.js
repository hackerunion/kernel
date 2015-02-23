var $ = require('shelljs');
var _ = require('lodash');

var debug = require('debug')('kernel');

module.exports = function(app) {
  var self = {};

  self._init = function() {
    self.refresh();
    return self;
  };

  self._tasks = function(context, cb) {
    return _.every(_.sortBy(_.filter(self._config, 'context', 'boot'), 'priority'), cb);
  };

  self._do = function(task) {
    var ret = null;

    debug("[" + task.context + ":" + task.priority + "]", task.id);
    ret = $.exec(task.process);
    debug(ret.code ? ("[fail:" + ret.code + "]") : "[ok]", ret.output);

    return ret && !ret.code;
  };

  self.refresh = function() {
    var cfg = $.cat(app.get('init'));
    
    try {
      self._config = JSON.parse(cfg);
    } catch (e) {
      return "Failed to load init configuration.";
    }
  };

  self.boot = function() {
    debug("Booting kernel...");
    
    $.pushd(app.get('root'));
    var res = self._tasks('boot', self._do);
    $.popd();

    return "ABORT";
  };

  self.halt = function() {
    debug("Halting kernel...");

    $.pushd(app.get('root'));
    var res = self._tasks('halt', self._do);
    $.popd();

    return "ABORT";
  };
  
  return self._init();
};
