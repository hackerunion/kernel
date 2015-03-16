var basicAuth = require('basic-auth');
var request = require('request');
var debug = require('debug')('kernel');
var _ = require('lodash');

var INVALID_NAME = '_';
var INVALID_PASS = '_';

module.exports = function(app) {
  var self = {};

  self.init = function() {
    return self;
  };

  self._reject = function(req, res, nuke) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };

  self.hideBasicHeader = function() {
    return function(req, res, next) {
      req.get = function(header) {
        if (header.toLowerCase() == 'authorization') {
          return undefined;
        }
    
        return req.get(header);
      };
    
      next();
    };
  };

  self.oauthify = function() {
    return function(req, res, next) {
      var user = req.session.user;
      var getToken =  req.query.access_token;
      var postToken = req.body ? req.body.access_token : undefined;
      var req_get = _.bind(req.get, req);
      req.get = function(header) {
        // only run this code if we successfully authenticated via basic
        if (header.toLowerCase() == 'authorization') {
          // always defer to explicit http tokens (basic-auth credentials are secondary to explicit tokens)
          // goes against spec ever so slightly
          if (getToken !== undefined || postToken !== undefined) {
            return undefined;
          }
          
          if (user && user.oauth) {
            return "Bearer " + user.oauth.access_token; 
          }

          // this ensures oauth doesn't succeed (we're trying to prompt the user for a password)
          if (req.basic == 'logout') {
            req.basic = null;
            return undefined;
          }
        }

        return req_get(header);
      };
    
      next();
    };
  };

  self.logout = function(force) {
    return function(req, res, next) {
      // only force logout if there is a user logged in (or requested)
      if (force || req.user || req.session.user) {
        req.basic = 'logout';
        req.user = null;
        req.session.user = null;
      }
      
      // otherwise, we're already logged out
      return next();
    };
  };
  
  // TODO: this forces oauth clients to add "api" flag to all requests... probably should fix this
  self.rejectInteractive = function(filter) {
    return function(err, req, res, next) {
      if (!err || req.query.api || (filter && !filter.test(err.name))) {
        return next(err);
      }
      
      self._reject(req, res);
    }
  };

  self.basic = function(guest) {
    var oauthPasswordRequest = function(req, res, username, password, next) {
      request.post(app.common.requestURI(req, function(uri) {
        uri.pathname = app.get('system path') + 'token';
      }), { 
        json: true, 
        form: {
          grant_type: 'password',
          username: username,
          password: password,
          client_id: app.get('server uid'),
          client_secret: app.get('server secret')
        },
      }, function (err, res, body) {
        if (err || res.statusCode != 200 || !('access_token' in body)) {
          return next(true);
        }
        
        app.core.readPasswdForUser(username, function(err, passwd) {
          if (err || !passwd) {
            return next(true);
          }
          
          // this defines the session-user object which contains all user fields plus a token
          next(false, {
            id: passwd.uid,
            passwd: passwd,
            oauth: body
          });
        });
      });
    };
  
    return function (req, res, next) {
      var creds = basicAuth(req);
      req.basic = false;

      // if creds missing, prompt for auth
      if (!creds || !creds.name || !creds.pass) {
        if (!guest) {
          return next();
        }

        // allow undeclared users to login as guests
        creds = { 'name': app.get('guest username'), 'pass': app.get('guest secret') };
      }
      
      // basic is set to "null" when falling back to a guest login is not allowed
      if (creds.name == INVALID_NAME && creds.pass == INVALID_PASS) {
        req.basic = null;
        return next();
      }
      
      if (creds.name == app.get('guest username') && creds.pass == app.get('guest secret')) {
        req.basic = null;
      }
  
      return oauthPasswordRequest(req, res, creds.name, creds.pass, function(err, user) {
        if (err || !user) {
          return next();
        }
  
        // add authentication information to session
        req.basic = true;
        req.session.user = user;

        return next();
      });
    };
  };

  self.authorise = function(guest) {
    // attempt basic auth + oauthification in one shot
    return function(req, res, next) {
      self.basic(guest)(req, res, function() {
        self.oauthify()(req, res, next);
      });
    };
  };

  self.invalidateURI = function(req, pathname) {
    return app.common.requestURI(req, function(uri) {
      uri.pathname = pathname;
      uri.auth = INVALID_NAME + ':' + INVALID_PASS;
    });
  };

  self.basicURI = function(req, user, pass) {
    return app.common.requestURI(req, function(uri) {
      uri.auth = user + ':' + pass;
    });
  };
  
  return self.init();
};
