var _ = require('lodash');
var fs = require('fs');
var cgi = require('cgi');
var etc = require('etc-passwd');
var path = require('path');
var posix = require('posix');
var domain = require('domain');

var SUID = 2048;
var SGID = 1024;

/*
 * Nifty trick: the kernel delegates almost everything to the underlying *nix implementation.
 */

module.exports = function(app) {
  var self = {};

  self.init = function() {
    return self;
  };

  self.readInternalPasswd = function(cb) {
    fs.readFile(app.get('passwd'), 'utf8', function (err, data) {
      cb(err, err ? null : JSON.parse(data));
    });
  };
  
  self.readPasswd = function(cb) {
    // TODO: optimize this
    var dom = domain.create();
    
    return dom.on('error', function(err) {
      return cb(err);

    }).run(function() { 
      etc.getUsers(function (err, users) {
        if (err) {
          return cb(err);
        }
  
        etc.getShadows(function (err, shadows) {
          if (err) {
            return cb(err);
          }
  
          var shadows = _.indexBy(shadows, function (s) { return s.username.toLowerCase(); });

          return cb(null, users.map(function(user) {
            var username = user.username.toLowerCase();
            var meta = null;
            
            // skip users without passwords
            if (!shadows[username] || !shadows[username].password) {
              return null;
            }
            
            // extract extra details from comment field
            try {
              meta = JSON.parse(new Buffer(user.comments, 'base64').toString('ascii'));
            } catch (e) {
              meta = { 'info': user.comments, 'uri': '', 'service': false };
            }
            
            // Note: this effectively defines the internal "passwd" schema
            return { 'username': username,
                     'password':  shadows[username].password,
                     'uid': user.uid,
                     'gid': user.gid,
                     'shell': user.shell,
                     'home': user.home,
                     'service': user.uid % 2,
                     'uri': meta.uri || '',
                     'info': meta.info || '',
                     'service': meta.service || false };
          }).filter(function (x) { return x; }));
        });
      });
    });
  };
    
  self.readPasswdForUser = function(username, cb) {
  	self.readPasswd(function(err, data) {
  		var passwd = _.find(data || [], { 'username': username.toLowerCase() });
  
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
          
          allow = fs.accessSync(script, FS.X_OK);
          
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
        
        var dom = domain.create();
        
        return dom.on('error', function(err) {
          return next(err);
        }).run(function() { 
          return cgi(script, options)(req, res, next);
        });
     });

    };
  };

  return self.init();
};
