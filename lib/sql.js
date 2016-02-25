'use strict';

var _ = require('lodash');
var utils = require('./utils');

_.str = require('underscore.string');

var sql = {

  escapeId: function (val) {
    return '[' + val.replace(/'/g, "''") + ']';
  },

  escape: function (val) {
    if (val === undefined || val === null) {
      return 'NULL';
    }

    switch (typeof val) {
      case 'boolean':
        return (val) ? '1' : '0';

      case 'number':
        return String(val);

      case 'object':
        val = val.toString();
    }

    val = val.replace(/[\']/g, function (s) {
      if (s === "\'") {
        return "''";
      }

      return " ";
    });

    return "'" + val + "'";
  },

  normalizeSchema: function (schema) {
    return _.reduce(schema, function (memo, field) {

      // Marshal mssql DESCRIBE to waterline collection semantics
      var attrName = field.ColumnName;
      var type = field.TypeName;

      memo[attrName] = {
        type: type
      };

      memo[attrName].autoIncrement = field.AutoIncrement;
      memo[attrName].primaryKey = field.PrimaryKey;
      memo[attrName].unique = field.Unique;
      memo[attrName].indexed = field.Indexed;
      memo[attrName].nullable = field.Nullable;

      return memo;
    }, {});
  },
    
  // @returns ALTER query for adding a column
  addColumn: function (collectionName, attrName, attrDef) {
    var tableName = collectionName;
    var columnDefinition = sql._schema(collectionName, attrDef, attrName);
    return 'ALTER TABLE ' + tableName + ' ADD ' + columnDefinition;
  },

  // @returns ALTER query for dropping a column
  removeColumn: function (collectionName, attrName) {
    var tableName = collectionName;
    attrName = attrName;
    return 'ALTER TABLE ' + tableName + ' DROP COLUMN ' + attrName;
  },
  
  selectQuery: function (collectionName, options) {
    var query = utils.buildSelectStatement(options, collectionName);

    query += sql.serializeOptions(collectionName, options);

    // if (options.sort) {
    //   query += utils.buildOrderByStatement(options);
    // }
    //
    // if (options.skip && typeof options.skip === 'number') {
    //   if (!options.sort) {
    //     query += 'ORDER BY @@IDENTITY ';
    //   }
    //
    //   query += 'OFFSET ' + options.skip + ' ROWS ';
    //
    //   if (options.limit && typeof options.limit === 'number') {
    //     query += 'FETCH NEXT ' + options.limit + ' ROWS ONLY';
    //   }
    // }

    return query.replace(/\s*$/, '');
  },

  insertQuery: function (collectionName, data) {
    var tableName = collectionName;
    return 'INSERT INTO ' + tableName  + ' (' + sql.attributes(collectionName, data) + ')' + ' VALUES (' + sql.values(collectionName, data) + '); SELECT @@IDENTITY AS [id]';
  },

  // Create a schema csv for a DDL query
  schema: function (collectionName, attributes) {
    return sql.build(collectionName, attributes, sql._schema);
  },

  _schema: function (collectionName, attribute, attrName) {
    attrName = '[' + attrName + ']';

    var type = sqlTypeCast(attribute.type, attribute.size);

    if (attribute.primaryKey) {
      // If type is an integer, set auto increment
      if (type === 'INT') {
        return attrName + ' INT IDENTITY PRIMARY KEY';
      }

      // Just set NOT NULL on other types
      return attrName + ' VARCHAR(255) NOT NULL PRIMARY KEY';
    }

    // Process UNIQUE field
    if (attribute.unique) {
      return attrName + ' ' + type + ' UNIQUE';
    }

    return attrName + ' ' + type + ' NULL';
  },

  // Create an attribute csv for a DQL query
  attributes: function (collectionName, attributes) {
    return sql.build(collectionName, attributes, sql.prepareAttribute);
  },

  // Create a value csv for a DQL query
  // key => optional, overrides the keys in the dictionary
  values: function (collectionName, values, key) {
    return sql.build(collectionName, values, sql.prepareValue, ', ', key);
  },

  updateCriteria: function (collectionName, values) {
    var query = sql.build(collectionName, values, sql.prepareCriterion);

    query = query.replace(/IS NULL/g, '=NULL');

    return query;
  },

  prepareCriterion: function (collectionName, value, key, parentKey) {
    if (validSubAttrCriteria(value)) {
      return sql.where(collectionName, value, null, key);
    }

    // Build escaped attr and value strings using either the key,
    // or if one exists, the parent key
    var attrStr, valueStr;

    // Special comparator case
    if (parentKey) {
      attrStr = sql.prepareAttribute(collectionName, value, parentKey);
      valueStr = sql.prepareValue(collectionName, value, parentKey);

      // Why don't we strip you out of those bothersome apostrophes?
      var nakedButClean = _.str.trim(valueStr, '\'');

      if (key === '<' || key === 'lessThan') {
        return attrStr + '<' + valueStr;
      } else if (key === '<=' || key === 'lessThanOrEqual') {
        return attrStr + '<=' + valueStr;
      } else if (key === '>' || key === 'greaterThan') {
        return attrStr + '>' + valueStr;
      } else if (key === '>=' || key === 'greaterThanOrEqual') {
        return attrStr + '>=' + valueStr;
      } else if (key === '!' || key === 'not') {
        if (value === null) {
          return attrStr + ' IS NOT NULL';
        } else if (_.isArray(value)) {
          //return attrStr + ' NOT IN (' + valueStr.split(',') + ')';
          return attrStr + ' NOT IN (' + sql.values(collectionName, value, key) + ')';
        } else {
          return attrStr + '<>' + valueStr;
        }
      } else if (key === 'like') {
        return attrStr + ' LIKE \'' + nakedButClean + '\'';
      } else if (key === 'contains') {
        return attrStr + ' LIKE \'%' + nakedButClean + '%\'';
      } else if (key === 'startsWith') {
        return attrStr + ' LIKE \'' + nakedButClean + '%\'';
      } else if (key === 'endsWith') {
        return attrStr + ' LIKE \'%' + nakedButClean + '\'';
      } else {
        throw new Error('Unknown comparator: ' + key);
      }
    } else {
      attrStr = sql.prepareAttribute(collectionName, value, key);
      valueStr = sql.prepareValue(collectionName, value, key);

      if (_.isNull(value)) {
        return attrStr + " IS NULL";
      } else {
        return attrStr + "=" + valueStr;
      }
    }
  },

  // prepareValue: function (collectionName, value, attrName) {
  prepareValue: function (collectionName, value) {
    // Cast dates to SQL
    if (_.isDate(value)) {
      value = toSqlDate(value);
    }

    // Cast functions to strings
    if (_.isFunction(value)) {
      value = value.toString();
    }

    // Escape (also wraps in quotes)
    return sql.escape(value);
  },

  prepareAttribute: function (collectionName, value, attrName) {
    return '[' + attrName + ']';
  },

  // Starting point for predicate evaluation
  // parentKey => if set, look for comparators and apply them to the parent key
  where: function (collectionName, where, key, parentKey) {
    return sql.build(collectionName, where, sql.predicate, ' AND ', undefined, parentKey);
  },

  // Recursively parse a predicate calculus and build a SQL query
  predicate: function (collectionName, criterion, key, parentKey) {

    var queryPart = '';

    if (parentKey) {
      return sql.prepareCriterion(collectionName, criterion, key, parentKey);
    }

    // OR
    if (key.toLowerCase() === 'or') {
      queryPart = sql.build(collectionName, criterion, sql.where, ' OR ');
      return ' ( ' + queryPart + ' ) ';
    }

    // AND
    else if (key.toLowerCase() === 'and') {
      queryPart = sql.build(collectionName, criterion, sql.where, ' AND ');
      return ' ( ' + queryPart + ' ) ';
    }

    // IN
    else if (_.isArray(criterion)) {
      var values = sql.values(collectionName, criterion, key) || 'NULL';

      queryPart = sql.prepareAttribute(collectionName, null, key) + " IN (" + values + ")";

      return queryPart;
    }

    // LIKE
    else if (key.toLowerCase() === 'like') {
      return sql.build(collectionName, criterion, function (collectionName, value, attrName) {
        var attrStr = sql.prepareAttribute(collectionName, value, attrName);

        if (_.isRegExp(value)) {
          throw new Error('RegExp not supported');
        }

        var valueStr = sql.prepareValue(collectionName, value, attrName);
        // Handle escaped percent (%) signs [encoded as %%%]
        valueStr = valueStr.replace(/%%%/g, '\\%');

        return attrStr + " LIKE " + valueStr;
      }, ' AND ');
    }

    // NOT
    else if (key.toLowerCase() === 'not') {
      throw new Error('NOT not supported yet!');
    }

    // Basic criteria item
    else {
      return sql.prepareCriterion(collectionName, criterion, key);
    }

  },

  serializeOptions: function (collectionName, options) {
    var queryPart = '';

    if (options.where) {
      queryPart += 'WHERE ' + sql.where(collectionName, options.where) + ' ';
    }

    if (options.or && Array.isArray(options.or) && options.or.length) {
      // sql.predicate(collectionName, criterion, key, parentKey)
      queryPart += ' AND ' + sql.predicate(collectionName, options.or, 'or');
    }

    if (options.sort) {
      queryPart += 'ORDER BY ';

      if (typeof options.sort === 'string') {
        options.sort = options.sort.trim();

        if (options.sort.charAt(0) === '-') {
          options.sort = options.sort.substr(1);
        }

        var parts = options.sort.split(/\s+/);

        queryPart += '[' + parts[0] + '] ';

        if (!parts[1] || parts[1] === 'ASC') {
          queryPart += 'ASC ';
        } else {
          queryPart += 'DESC ';
        }
      } else if (Object.prototype.toString.call(options.sort) === '[object Object]') {
        for (var column in options.sort) {
          if (options.sort[column]) {
            if (column.charAt(0) === '-') {
              column = column.substr(1);
              options.sort[column] = 0;
            }

            queryPart += '[' + column + '] ';

            if (options.sort[column] === 1) {
              queryPart += 'ASC, ';
            } else {
              queryPart += 'DESC, ';
            }
          }
        }

        queryPart = queryPart.replace(/,\s*$/, ' ');
      }
    }
    
    if (options.groupBy) {
      var groupByVal = '';
      if (Array.isArray(options.groupBy)) {
        options.groupBy.forEach(function (value) {
          if (options.select.indexOf(value < 0)) {
            groupByVal += '[' + value + '], ';
          }
        });
      } else if (typeof options.groupBy === 'string' && options.select.indexOf(options.groupBy < 0)) {
        groupByVal += '[' + options.groupBy + '], ';
      }
      queryPart += 'GROUP BY ' + groupByVal;
      queryPart = queryPart.replace(/,\s*$/, ' ');
    }

    if (options.skip && typeof options.skip === 'number') {
      if (!options.sort) {
        queryPart += 'ORDER BY @@IDENTITY ';
      }

      queryPart += 'OFFSET ' + options.skip + ' ROWS ';

      if (options.limit && typeof options.limit === 'number') {
        queryPart += 'FETCH NEXT ' + options.limit + ' ROWS ONLY';
      }
    }

    return queryPart;
  },

  build: function (collectionName, collection, fn, separator, keyOverride, parentKey) {
    separator = separator || ', ';

    var $sql = '';

    _.each(collection, function (value, key) {
      $sql += fn(collectionName, value, keyOverride || key, parentKey);

      // (always append separator)
      $sql += separator;
    });

    return _.str.rtrim($sql, separator);
  }

};

/**
 * Casts Waterline types into Microsoft SQL Server data types.
 *
 * @param {String} type The Waterline type to cast.
 * @param {Number} size The size for (N)VARCHAR types.
 *
 * @return {String} The casted type.
 */
function sqlTypeCast(type, size) {

  type = type && String(type).toLowerCase();
  size = size || 'max';

  switch (type) {
    case 'binary':
    case 'string':
    case 'json':
      return 'NVARCHAR(%s)'.replace('%s', size);

    case 'array':
    case 'text':
      return 'VARCHAR(%s)'.replace('%s', size);

    case 'boolean':
      return 'BIT';

    case 'int':
    case 'integer':
      return 'INT';

    case 'float':
    case 'double':
      return 'FLOAT';

    case 'date':
      return 'DATE';

    case 'time':
      return 'TIME';

    case 'datetime':
      return 'DATETIME2';

    default:
      console.error("Unregistered type given: ", type);
      return 'VARCHAR';
  }
}

/**
 * Converts a javascript date to Microsoft SQL Server DATETIME2 format.
 *
 * @param {Date} date The JavaScript date to convert.
 *
 * @return {String} The formatted DATETIME2 string.
 */
function toSqlDate(date) {
  // DATETIME2 format: 'YYYY-MM-DDThh:mm:ss.nn'
  return date.getUTCFullYear() + '-' +
    ('00' + (date.getUTCMonth() + 1)).slice(-2) + '-' +
    ('00' + date.getUTCDate()).slice(-2) + 'T' +
    ('00' + date.getUTCHours()).slice(-2) + ':' +
    ('00' + date.getUTCMinutes()).slice(-2) + ':' +
    ('00' + date.getUTCSeconds()).slice(-2) + '.' +
    date.getUTCMilliseconds();
}

function validSubAttrCriteria(c) {
  return _.isObject(c) && (!_.isUndefined(c.not) || !_.isUndefined(c.greaterThan) || !_.isUndefined(c.lessThan) ||
    !_.isUndefined(c.greaterThanOrEqual) || !_.isUndefined(c.lessThanOrEqual) || !_.isUndefined(c['<']) ||
    !_.isUndefined(c['<=']) || !_.isUndefined(c['!']) || !_.isUndefined(c['>']) || !_.isUndefined(c['>=']) ||
    !_.isUndefined(c.startsWith) || !_.isUndefined(c.endsWith) || !_.isUndefined(c.contains) || !_.isUndefined(c.like));
}

module.exports = sql;
