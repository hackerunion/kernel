#!/usr/bin/env node

var kexec = require('kexec');
var posix = require('posix');

function main(args) {
  var uid = posix.getuid();
  var gid = posix.getgid();
  var username = posix.getpwnam(uid).name;

  // set secondary groups appropriately (note: ev_spawn clears these; this wrapper re-injects them)
  posix.initgroups(username, gid);
  posix.setuid(uid);
  posix.setgid(gid);
   
  kexec(args[0], args.slice(1));
};

main(process.argv.slice(2));
