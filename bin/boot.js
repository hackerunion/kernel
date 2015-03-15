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

  // shutdown the server when we receive a sigterm
  process.on('SIGTERM', function() {
    debug("GOT A SIGTERM");
    var down = app.get('bios').halt();
    debug("?");
    if (!down) {
      console.error("HALT: " + err);
      return;
    }
    
    return cluster.disconnect();
  });


  // start server
  cluster.fork();
  
  cluster.on('exit', function(s) {
    if (s.suicide || s.process.signalCode == 'SIGKILL') {
      console.warn("Shutdown received. Time to sell the farm!");
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
