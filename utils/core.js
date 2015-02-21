var _ = require('lodash');
var fs = require('fs');
var cgi = require('cgi');
var path = require('path');
var posix = require('posix');
var access = require('unix-access');

var SUID = 2048;
var SGID = 1024;

module.exports = function(app) {
  var self = {};

  self.init = function() {
    return self;
  };

  self.readPasswd = function(cb) {
    fs.readFile(app.get('passwd'), 'utf8', function (err, data) {
      cb(err, err ? null : JSON.parse(data));
    });
  };
    
  self.readPasswdForUser = function(username, cb) {
  	self.readPasswd(function(err, data) {
  		var passwd = _.find(data || [], { 'username': username });
  
  		if (!passwd) {
  			return cb("User not found");
  		}
  
  		cb(null, passwd);
  	});
  };
    
  self.readPasswdForUID = function(uid, cb) {
  	self.readPasswd(function(err, data) {
  		var passwd = _.find(data || [], { 'uid': uid });
  
  		if (!passwd) {
  			return cb("User not found");
  		}
  
  		cb(null, passwd);
  	});
  };
  
  self.passwd = function() {
    return function(req, res, next) {
      if (req.user === undefined || req.user.id === undefined || req.user.passwd) {
        return next();
      }
  
      self.readPasswdForUID(req.user.id, function(err, passwd) {
        if (err || !passwd) {
          return next("User not found");
        }
        
        req.user.passwd = passwd;
        next();
      });
    }
  };

  self.spawn = function(sudo) {
    return function(req, res, next) {
      var script = path.resolve(app.get('root'), path.normalize(req.path).slice(1));
      var options = {
        'cwd': app.get('root'),
        'stderr': res
      };

      fs.stat(script, function(err, stats) {
        if (err || !stats) {
          return next(err);
        }

        if (sudo) {
          // run as server: this should never happen externally
        } else {
          options.uid = parseInt(req.user.passwd.uid);
          options.gid = parseInt(req.user.passwd.gid);

          // ensure file is executable to real user before suid/sgid check
          var uid = process.getuid();
          var gid = process.getgid();
          var allow = false;

          posix.setregid(options.gid);
          posix.setreuid(options.uid);
          
          allow = access.sync(script, 'x');
          
          posix.setreuid(uid);
          posix.setregid(gid);

          if (!allow) {
            return next("Access denied (" + stats.mode + ")");
          }

          if (stats.mode & SUID) {
            options.uid = stats.uid;
          }
  
          if (stats.mode & SGID) {
            options.gid = stats.gid;
          }
        }

        return cgi(script, options)(req, res, next);
     });

    };
  };

  return self.init();
};
