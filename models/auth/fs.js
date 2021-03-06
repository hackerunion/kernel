var crypt = require('crypt3');
var debug = require('debug')('kernel');

module.exports = function(app) {
  var model = {};
  var storage = app.get('storage');
  
  model.init = function() {
    // Every time the server restarts, these containers are emptied
    // This causes all oauth tokens to become invalid
    // Cookie amnesia causes server to forget old sessions and tokens on restart
    // Without an old token, special case allows guest to skip password prompt (GOOD)
    // With an old token, special case is skipped, token fails oauth, and password prompt is shown (BAD)

    storage.setItem('oauth.authCodes', []);
    storage.setItem('oauth.accessTokens', []);
    storage.setItem('oauth.refreshTokens', []);
    
    storage.setItem('oauth.authorizedClientIds', {
        // password requests can only be issued by the root client (us)
        password: [
			    app.get('server uid')
        ],
        refresh_token: [
          '*'
        ],
        authorization_code: [
          '*'
        ]
      });

    return model; 
  };
  
  // Debug function to dump the state of the data stores
  model.dump = function() {
    console.log('oauth.accessTokens', storage.getItem('oauth.accessTokens'));
    console.log('oauth.clients', storage.getItem('oauth.clients'));
    console.log('oauth.authorizedClientIds', storage.getItem('oauth.authorizedClientIds'));
    console.log('oauth.refreshTokens', storage.getItem('oauth.refreshTokens'));
    console.log('oauth.users', storage.getItem('oauth.users'));
  };
  
  /*
   * Required
   */
  
  model.getAuthCode = function (authCode, callback) {
    var oauthAuthCodes = storage.getItem('oauth.authCodes');

    for(var i = 0, len = oauthAuthCodes.length; i < len; i++) {
      var elem = oauthAuthCodes[i];
      if(elem.authCode === authCode) {
        return callback(false, elem);
      }
    }
    callback(false, false);
  };
  
  model.getAccessToken = function (bearerToken, callback) {
    var oauthAccessTokens = storage.getItem('oauth.accessTokens');
    
    for(var i = 0, len = oauthAccessTokens.length; i < len; i++) {
      var elem = oauthAccessTokens[i];
      if(elem.accessToken === bearerToken) {
        return callback(false, elem);
      }
    }
    callback(false, false);
  };
  
  model.getRefreshToken = function (bearerToken, callback) {
    var oauthRefreshTokens = storage.getItem('oauth.refreshTokens');

    for(var i = 0, len = oauthRefreshTokens.length; i < len; i++) {
      var elem = oauthRefreshTokens[i];
      if(elem.refreshToken === bearerToken) {
        return callback(false, elem);
      }
    }
    callback(false, false);
  };
  
  model.getClient = function (clientId, clientSecret, callback) {
    // clients and users are 1:1 (similar to unix convention)
    this.getUser(clientId, clientSecret, function(err, user) {
      if (!err && user) {
        // map user to client fields
        user.clientId = user.id;
        user.clientSecret = user.passwd.password;
        user.redirectUri = user.passwd.uri;
      }

      return callback(err, user);
    }, true, true);
  };
  
  model.grantTypeAllowed = function (clientId, grantType, callback, strict) {
    var authorizedClientIds = storage.getItem('oauth.authorizedClientIds');
    callback(false, authorizedClientIds[grantType] && (
      authorizedClientIds[grantType].indexOf(clientId.toLowerCase()) >= 0 ||
      (!strict && authorizedClientIds[grantType].indexOf("*") >=0)));
  };
  
  model.saveAuthCode = function (authCode, clientId, expires, user, callback) {
    var oauthAuthCodes = storage.getItem('oauth.authCodes');

    oauthAuthCodes.unshift({
      authCode: authCode,
      clientId: clientId,
      userId: user.id,
      expires: expires
    });
  
    storage.setItem('oauth.authCodes', oauthAuthCodes);

    callback(false);
  };

  model.saveAccessToken = function (accessToken, clientId, expires, user, callback) {
    var oauthAccessTokens = storage.getItem('oauth.accessTokens');

    oauthAccessTokens.unshift({
      accessToken: accessToken,
      clientId: clientId,
      userId: user.id,
      expires: expires
    });
    
    storage.setItem('oauth.accessTokens', oauthAccessTokens);

    callback(false);
  };
  
  model.saveRefreshToken = function (refreshToken, clientId, expires, user, callback) {
    var oauthRefreshTokens = storage.getItem('oauth.refreshTokens');

    oauthRefreshTokens.unshift({
      refreshToken: refreshToken,
      clientId: clientId,
      userId: user.id,
      expires: expires
    });

    storage.setItem('oauth.refreshTokens', oauthRefreshTokens);
  
    callback(false);
  };
  
  /*
   * Required to support password grant type
   */

  model.getUser = function (username, password, callback, noPass, byId) {
    // allow querying by other fields (namely uid)
    var field = byId ? 'uid' : 'username';

    app.core.readPasswd(function(err, passwd) {
      if (err) {
        return callback(false, false);
      }

      for(var i = 0, len = passwd.length; i < len; i++) {
        var elem = passwd[i];
        
        if(elem[field] == username) {
          var user = {
            'id': elem.uid,
            'passwd': elem
          };

          // HACK: password checks get in the way when hacking the kernel
          if (app.get('kernel hacker')) {
            debug("KERNEL_HACKER: not checking passwords!");
            noPass = true;
          }

          if (noPass) {
            return callback(false, user);
          }
	        
          return callback(false, (crypt(password, elem.password) === elem.password) ? user : false);
        }
      }
  
      callback(false, false);
    });
  };
  
	return model.init();
}
