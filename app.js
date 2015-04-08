var debug = require('debug')('kernel');
var express = require('express');
var session = require('cookie-session');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var storage = require('node-persist');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var oauthServer = require('oauth2-server');

var routes = require('./routes/index');
var common = require('./utils/common');
var core = require('./utils/core');
var auth = require('./utils/auth');
var authModel = require('./models/auth/fs');

var app = express();

/*
 * Initialize environment
 */

app.set('port', process.env.SERVER_PORT || 3000);
app.set('secure port', process.env.SERVER_SECURE_PORT || 4000);
app.set('uri', process.env.SERVER_URI || ('http://localhost:' + app.get('port')));
app.set('cookie secret', process.env.COOKIE_SECRET);
app.set('root', process.env.SERVER_ROOT || path.resolve(__dirname, '../../..') );
app.set('server uid', process.env.SERVER_UID);
app.set('server username', process.env.SERVER_USERNAME);
app.set('server secret', process.env.SERVER_SECRET);
app.set('server key', process.env.SERVER_SECURE_KEY);
app.set('server certificate', process.env.SERVER_SECURE_CERT);
app.set('guest username', process.env.GUEST_USERNAME || 'guest');
app.set('guest secret', process.env.GUEST_SECRET || 'guest');
app.set('guest mode', app.get('guest username') && app.get('guest secret'));
app.set('index file', process.env.INDEX_FILE || 'index.cgi');
app.set('index directory', process.env.INDEX_DIR || 'cgi-bin');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.set('storage', storage);
app.set('system path', '/sbin/');
app.set('swap', path.resolve(app.get('root'), 'var/run/kernel'));
app.set('passwd', path.resolve(app.get('root'), 'etc/passwd.json'));
app.set('init', path.resolve(app.get('root'), 'sbin/init'));
app.set('www', path.resolve(app.get('root'), 'var/www'));
app.set('trust proxy', 1);

switch(app.get('env')) {
  case 'production':
    app.set('production', true);
    break;

  default:
    app.set('production', false);
    break;
}

var sbin = app.get('system path');

/*
 * Install base middleware.
 */

app.use(favicon(__dirname + '/public/images/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: app.get('cookie secret'),
  signed: true
}));

/*
 * Prepare utilities.
 */

// simple fs-based data layer
storage.initSync({ dir: app.get('swap') });

// helpers and middleware
app.common = common(app);
app.auth = auth(app);
app.core = core(app);

// oauth server implementation
app.oauth = oauthServer({
  model: authModel(app),
  grants: ['password', 'authorization_code', 'refresh_token'],
  clientIdRegex: /^\d+$/i, // uids are treated as client IDs
  debug: true
});

/*
 * Handle oauth authentication requests.
 */

app.all(sbin + 'token', app.oauth.grant());

/*
 * Invalidate credentials and prompt for login.
 */

app.get(sbin + 'logout',
  app.auth.logout(),
  function(req, res, next) {
    return res.redirect(app.auth.invalidateURI(req, sbin + 'login'));
  }
);

/*
 * Prompt for credentials and redirect to uri or home directory.
 */

app.get(sbin + 'login', 
  app.auth.authorise(),
  app.oauth.authorise(),
  app.core.passwd(),
  function(req, res, next) {
    return res.redirect(req.user.passwd.uri || app.common.pathToURI(req.user.passwd.home));
  }
);

/*
 * Allow third-party authorization (i.e., "sudo").
 */

app.get(sbin + 'auth',
  app.auth.authorise(),
  app.oauth.authorise(),
  function (req, res, next) {
    app.oauth.model.getClient(req.query.client_id, null, function(err, client) {
      var fail = function(err) {
        return res.render('error', { 'error': err });
      }
      
      if (err || !client) {
        return fail("invalid client");
      }
  
      res.render('auth', {
        'auth': req.session.user,
        'client': client, 
        'redirect_uri': req.query.redirect_uri
      });
    });
  }
);

/*
 * Complete authorization process.
 */

app.post(sbin + 'auth',
  app.auth.authorise(),
  app.oauth.authorise(),
  app.oauth.authCodeGrant(function (req, next) {
    next(null, req.body.allow === 'yes', req.session.user);
  })
);

app.all(sbin + 'shutdown',
  app.auth.authorise(),
  app.oauth.authorise(),
  app.core.passwd(),
  function (req, res, next) {
    var pid = app.get('master pid');

    if (pid === undefined) {
      return res.sendStatus(500);
    }

    res.sendStatus(200);
    return process.kill(pid, 'SIGTERM');
  }
);

/*
 * CGI access to the server.
 */

app.all(RegExp("^(?!" + sbin + ")"),
  app.auth.authorise(app.get('guest mode')),
  app.oauth.authorise(),
  app.core.passwd(),
  app.core.exec())

/*
 * Testing utils.
 */

app.get(sbin + 'debug',
  app.auth.authorise(),
  app.oauth.authorise(),
  app.core.passwd(),
  function(req, res) {
    res.send({ 'user': req.user, 'session': req.session });
  }
);

/*
 * Error handling.
 */

// these only affect error rendering if auth error encountered
app.use(app.auth.rejectInteractive(/oauth/i),
        app.oauth.errorHandler()
);

app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: app.get('production') ? {} : err
    });
});

/*
 * Take a bow.
 */

module.exports = app;
