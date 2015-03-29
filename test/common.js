global.rewire = require('rewire');
global.sinon = require('sinon');
global.chai = require('chai');
global.assert = chai.assert;
global.expect = chai.expect;

chai.should();
chai.config.includeStack = true;

process.env.NODE_ENV = 'test';
