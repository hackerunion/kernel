var debug = require('debug')('kernel');
var _ = require('lodash');
var fs = require('fs');
var cgi = require('cgi');
var etc = require('etc-passwd');
var path = require('path');
var posix = require('posix');
var domain = require('domain');
var stream = require('stream');
var querystring = require('querystring');

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
      
      if (err) {
  			return cb("Error: " + err);
      }

  		if (!passwd) {
  			return cb("Error: User \"" + username + "\" not found");
  		}
  
  		cb(null, passwd);
  	});
  };
    
  self.readPasswdForUID = function(uid, cb) {
  	self.readPasswd(function(err, data) {
  		var passwd = _.find(data || [], { 'uid': uid });
  
      if (err) {
  			return cb(err);
      }

  		if (!passwd) {
  			return cb("Error: UID " + uid + " not found");
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
        if (err) {
          return next(err);
        }

        if (!passwd) {
          return next("Error: UID " + req.user.id + " not found");
        }
        
        req.user.passwd = passwd;
        next();
      });
    }
  };

  self.exec = function(sudo, raw) {
    var _lookupUsername = function(uid) {
      return posix.getpwnam(uid).name;
    };

    var _enterUser = function(state) {
      posix.initgroups(state.username, state.gid);
      posix.setregid(state.gid);
      posix.setreuid(state.uid);
    };

    var _exitUser = function(state) {
      posix.setreuid(state.uid);
      posix.setregid(state.gid);
      posix.initgroups(state.username, state.gid);
    };

    var _userState = function(uid, gid) {
      return { 'uid': uid, 'gid': gid, 'username': _lookupUsername(uid) };
    };

    return function(req, res, next) {
      var file = app.common.URItoPath(req.path);
      var prev = _userState(process.getuid(), process.getgid());
      var curr = prev;

      // sanitize the environment
      var options = {
        'cwd': app.get('root'),
        'timeout': parseInt(app.get('cgi timeout')),
        'stderr': process.stderr,
        'env': {
          'COOKIE_SECRET': '*',
          'SERVER_SECRET': '*',
          'SERVER_SECURE_KEY': '*',
          'SERVER_SECURE_CERT': '*',
          'HTTP_AUTHORIZATION': '*',
          'USER': req.user.passwd.username,
          'HOME': req.user.passwd.home
        }
      };

      fs.stat(file, function(err, stats) {
        if (err || !stats || !(stats.isFile() || stats.isDirectory())) {
          return next(err);
        }

        if (stats.isDirectory()) {
          return res.redirect(app.common.pathToURI(path.join(file, app.get('index file'))) + (req.query ? '?' + querystring.stringify(req.query) : ''));
        }

        // run as server: this should never happen externally
        if (sudo) {
          options.timeout = null;

        } else {
          curr = _userState(parseInt(req.user.passwd.uid), parseInt(req.user.passwd.gid));

          // ensure file is executable to real user before suid/sgid check
          var exec = true;
          var view = true;
          
          _enterUser(curr);

          try {
            fs.accessSync(file, fs.X_OK);
          } catch(e) {
            exec = false;
          }
          
          if (!exec) {
            try {
              fs.accessSync(file, fs.R_OK);
            } catch(e) {
              view = false;
            }
          }
          
          _exitUser(prev);
          
          if (!exec && !view) {
            return next("Access denied (" + stats.mode + ")");
          }

          if (!exec) {
            return res.sendFile(file);
          }

          if (stats.mode & SUID) {
            curr.uid = stats.uid;
          }
  
          if (stats.mode & SGID) {
            curr.gid = stats.gid;
          }
        }
        
        var dom = domain.create();
        var body = new stream.Readable();

        return dom.on('error', function(err) {
          _exitUser(prev);
          return next(err);
        }).run(function() {
          // use exec handler to inject extra functionality
          if (!raw) {
            options.args = [ file ];
            file = app.get('exec handler');
          }

          // need to override pipe since bodyParser clobbers the initial stream
          req.pipe = function(out) {
            out.write(querystring.stringify(req.body), null, function() {
              out.end();
            });
          };

          _enterUser(curr);
          return cgi(file, options)(req, res, function() {
            _exitUser(prev);
            return next(req, res);
          });
        });
     });

    };
  };

  return self.init();
};
