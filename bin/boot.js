#!/usr/bin/env node

var fs = require('fs');
var debug = require('debug')('kernel');
var cluster = require('cluster');

var http = require('http');
var https = require('https');

var app = require('../app');
var bios = require('../init')(app);

var prepareWorker = function(worker) {
  worker.send({ 'pid': process.pid });
};

var boot = function() {
  // initialize the server (blocking)
  var up = bios.boot();
  
  if (!up) {
    console.error("PANIC: " + err + " (boot)");
    return process.exit(1);
  }
};

if (process.env.SERVER_NO_INIT) {
  console.warn("The server is running without init for local development.");

} else if (process.env.SERVER_ONLY_INIT) {
  console.warn("The server will run init and then stop for local development.");
  
  boot();
  process.exit(0);

} else {
  if (cluster.isMaster) {
    if (process.getuid()) {
      console.warn("The kernel will misbehave unless it's run as root.");
    }
    
    boot();

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

var httpServer = http.createServer(app);
var httpsServer = https.createServer({
  key: fs.readFileSync(app.get('server key')),
  cert: fs.readFileSync(app.get('server certificate')),
  passphrase: 'password'
}, app);

httpServer.listen(app.get('port'), function() {
  debug('Kernel listening for HTTP connections on port ' + httpServer.address().port);
});

httpsServer.listen(app.get('secure port'), function() {
  debug('Kernel listening for HTTPS connections on port ' + httpsServer.address().port);
});
