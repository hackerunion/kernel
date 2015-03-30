module.exports = {};

module.exports.install = function() {
  process.env.SERVER_PORT = 3000;
  process.env.SERVER_SECURE_PORT = 4000;
  process.env.SERVER_URI = 'http://localhost:3000';
  process.env.SERVER_ROOT = '/test';
  process.env.SERVER_UID = 1337;
  process.env.SERVER_USERNAME = 'server';
  process.env.SERVER_SECRET = 'password';
  process.env.SERVER_SECURE_KEY = '/test/ssl/server.key';
  process.env.SERVER_SECURE_CERT = '/test/ssl/server.cert';
  process.env.COOKIE_SECRET = 'cookie-secret';
  process.env.GUEST_USERNAME = 'guest';
  process.env.GUEST_SECRET = 'password';
  process.env.INDEX_FILE = 'index.cgi';
  process.env.INDEX_DIR = 'cgi-bin';
};

module.exports.restore = function() {
  delete process.env.SERVER_PORT;
  delete process.env.SERVER_SECURE_PORT;
  delete process.env.SERVER_URI;
  delete process.env.SERVER_ROOT;
  delete process.env.SERVER_UID;
  delete process.env.SERVER_USERNAME;
  delete process.env.SERVER_SECRET;
  delete process.env.SERVER_SECURE_KEY;
  delete process.env.SERVER_SECURE_CERT;
  delete process.env.COOKIE_SECRET;
  delete process.env.GUEST_USERNAME;
  delete process.env.GUEST_SECRET;
  delete process.env.INDEX_FILE;
  delete process.env.INDEX_DIR;
};
