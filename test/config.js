var credentials = require('./credentials.json');
var adapter = require('..');

module.exports = {
  adapters: {
    default: adapter
  },

  connections: {
    default: {
      adapter: 'default',
      database: credentials.database,
      host: credentials.host,
      port: 1433,
      user: credentials.user,
      password: credentials.password
    }
  },

  defaults: {
    migrate: 'create'
  }
};
