#!/usr/bin/env node

var fs = require('fs');
var debug = require('debug')('kernel');
var cluster = require('cluster');

var app = require('../app');
var bios = require('../init')(app);

if (cluster.isMaster) {
  if (process.getuid()) {
    console.warn("The kernel will misbehave unless it's run as root.");
  }
  
  // initialize the server (blocking)
  var up = bios.boot();
  
  if (!up) {
    console.error("PANIC: " + err);
    return process.exit(1);
  }

  // start server
  cluster.fork();
  
  cluster.on('exit', function(s) {
    if (s.process.signalCode == 'SIGKILL') {
      console.warn("Shutdown received. Stopping...");
      cluster.disconnect();
      return;
    }

    console.warn("Server (" + s.id + ") died. Restarting...");
    cluster.fork();
  });

  return;
}

var server = app.listen(app.get('port'), function() {
  debug('Kernel listening on port ' + server.address().port);
});
