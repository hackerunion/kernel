#!/usr/bin/env node

var fs = require('fs');
var debug = require('debug')('kernel');
var cluster = require('cluster');

var app = require('../app');
var init = require('../init');

if (cluster.isMaster) {
  if (process.getuid()) {
    console.warn("The kernel will misbehave unless it's run as root.");
  }
  
  // initialize the server (blocking)
  var system = init(app);
  var err = system.boot();

  if (err) {
    console.error("PANIC: " + err);
    return process.exit(1);
  }

  // start server
  cluster.fork();
  
  cluster.on('exit', function(s) {
    console.warn("Server (" + s.id + ") died. Restarting...");
    cluster.fork();
  });

  return;
}

var server = app.listen(app.get('port'), function() {
  debug('Kernel listening on port ' + server.address().port);
});
