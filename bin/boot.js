#!/usr/bin/env node

var fs = require('fs');
var debug = require('debug')('kernel');
var cluster = require('cluster');

var app = require('../app');
var bios = require('../init')(app);

var prepareWorker = function(worker) {
  worker.send({ 'pid': process.pid });
};

if (process.env.SERVER_NO_INIT) {
  console.warn("The server is running without init for local development.");

} else {
  if (cluster.isMaster) {
    if (process.getuid()) {
      console.warn("The kernel will misbehave unless it's run as root.");
    }
    
    // initialize the server (blocking)
    var up = bios.boot();
    
    if (!up) {
      console.error("PANIC: " + err + " (boot)");
      return process.exit(1);
    }
  
    // shutdown the server when we receive a sigterm
    process.on('SIGTERM', function() {
      var down = app.get('bios').halt();
  
      if (!down) {
        console.error("PANIC: " + err + " (halt)");
        return;
      }
      
      return cluster.disconnect();
    });
    
    // start server
    prepareWorker(cluster.fork());
    
    cluster.on('exit', function(s) {
      if (s.suicide || s.process.signalCode == 'SIGKILL') {
        console.warn("Shutdown received. Time to sell the farm!");
        return;
      }
  
      console.warn("Server (" + s.id + ") died. Restarting...");
      prepareWorker(cluster.fork());
    });
  
    return;
  
  } else {
    process.on('message', function(msg) {
      if (msg && msg.pid) {
        app.set('master pid', msg.pid);
      }
    });
  }
}

var server = app.listen(app.get('port'), function() {
  debug('Kernel listening on port ' + server.address().port);
});
