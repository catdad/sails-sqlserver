Microsoft SQL Server adapter for [waterline](https://github.com/balderdashy/waterline). Built for Microsoft SQL Server 2012 and newer.

# Installing

```sh
$ npm install waterline-sqlserver --save
```

# Usage
## Configuration and initialization

```js
var adapter = require('waterline-sqlserver');
var Waterline = require('waterline');

var waterline = new Waterline();

var config = {

  adapters: {
    default: adapter
  },

  connections: {
    default: {
      adapter: 'default',
      database: 'database_name',
      host: 'addrestohost',
      port: 1433,
      user: 'dbo',
      persistent: true,
      password: 'superlongpassword'
    }
  },

  defaults: {
    migrate: 'create'
  }

};

waterline.initialize(config, function (err, data) {
  if (err) {
    throw err;
  }

  var collections = data.collections;
  var connections = data.connections;
});
```

## Collection/Model definition

```js
var bcrypt = require('bcrypt');

var userModel = {

  attributes: {

    name: {
      type: 'string',
      required: true
    },

    email: {
      type: 'string',
      required: true,
      unique: true,
      size: 255 // defaults to 'max'
    },

    password: {
      type: 'string',
      required: true
    },

    role: {
      model: 'role'
    }

  },

  beforeCreate: function (values, next) {
    bcrypt.hash(values.password, 8, function (err, hash) {
      if (err) {
        return next(err);
      }

      values.password = hash;

      next();
    });
  }

};
```
