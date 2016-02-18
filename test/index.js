var credentials = require('./credentials.json');
var Waterline = require('waterline');
var expect = require('chai').expect;
var models = require('./models');
var config = require('./config');
var adapter = require('..');

describe('Waterline SQL Server', function () {
  var db = new Waterline();

  var collections = {};
  var connections = {};

  var data = {
    users: [],
    posts: [],
    tags: []
  };

  describe('adapter', function () {
    it('should be an object', function () {
      expect(adapter).to.be.an('object');
    });

    it('should load the collections', function () {
      models.forEach(function (model) {
        model.connection = 'default';
        db.loadCollection(Waterline.Collection.extend(model));
      });
    });

    it('should initialize successfuly', function (done) {
      db.initialize(config, function (err, data) {
        expect(err).to.be.null;

        expect(data).to.be.an('object');
        expect(data.collections).to.be.an('object');
        expect(data.connections).to.be.an('object');

        collections = data.collections;
        connections = data.connections;

        done();
      });
    });
  });

  describe('user collection', function () {
    it('should not create a user without a required field', function (done) {
      collections.user.create({
        name: 'Emailess User',
        email: null
      }).

      exec(function (err, user) {
        expect(err).to.not.be.null;
        expect(user).to.not.be.ok;

        done();
      });
    });

    it('should create a user named John Smith, age 36 and email john.smith@example.com', function (done) {
      collections.user.create({
        name: 'John Smith',
        email: 'john.smith@example.com',
        age: 36
      }).

      exec(function (err, user) {
        expect(err).to.be.null;

        expect(user.name).to.be.a('string');
        expect(user.name).to.equal('John Smith');
        expect(user.email).to.be.a('string');
        expect(user.email).to.equal('john.smith@example.com');
        expect(user.age).to.be.a('number');
        expect(user.age).to.equal(36);
        expect(user.id).to.be.a('number');

        data.users.push(user);

        done();
      });
    });

    it('should not create a user with a duplicated email', function (done) {
      collections.user.create({
        name: 'John Smith Clone',
        email: 'john.smith@example.com',
        age: 63
      }).

      exec(function (err, user) {
        expect(err).to.not.be.null;
        expect(user).to.not.be.ok;

        done();
      });
    });

    it('should find a user by it\'s id', function (done) {
      collections.user.findOneById(data.users[0].id).

      exec(function (err, user) {
        expect(err).to.be.null;
        expect(user).to.be.an('object');
        expect(user.id).to.equal(data.users[0].id);

        done();
      });
    });

    it('should find a user by it\'s email', function (done) {
      collections.user.findOne().

      where({
        email: data.users[0].email
      }).

      exec(function (err, user) {
        expect(err).to.be.null;
        expect(user).to.be.an('object');
        expect(user.email).to.equal(data.users[0].email);

        done();
      });
    });
  });

  describe('tags collection', function () {
    it('should not create a tag without a name', function (done) {
      collections.tag.create({
        name: null
      }).

      exec(function (err, tag) {
        expect(err).to.not.be.null;
        expect(tag).to.not.be.ok;

        done();
      });
    });

    it('should create many tags', function (done) {
      collections.tag.create([{
        name: 'waterline'
      }, {
        name: 'sqlserver'
      }, {
        name: 'adapter'
      }]).

      exec(function (err, tags) {
        expect(err).to.be.null;
        expect(tags).to.be.an('array');

        data.tags = tags;

        done();
      });
    });

    it('should not create a tag with a duplicated name', function (done) {
      collections.tag.create({
        name: 'waterline'
      }).

      exec(function (err, tag) {
        expect(err).to.not.be.null;
        expect(tag).to.not.be.ok;

        done();
      });
    });
  });

  describe('posts collection', function () {
    it('should create a post', function (done) {
      collections.post.create({
        title: 'This is a post title',
        body: 'This is the post body. Lots and lots of text.',
        user: data.users[0],
        tags: data.tags
      }).

      exec(function (err, post) {
        expect(err).to.be.null;

        expect(post).to.be.an('object');
        expect(post.title).to.be.a('string');
        expect(post.body).to.be.a('string');
        expect(post.tags).to.be.an('array');
        expect(post.user).to.be.a('number');
        expect(post.user).to.equal(data.users[0].id);

        data.posts.push(post);

        done();
      });
    });

    it('should retrieve a post by it\'s id', function (done) {
      collections.post.findOneById(data.posts[0].id).

      exec(function (err, post) {
        expect(err).to.be.null;

        expect(post).to.be.an('object');
        expect(post.title).to.be.a('string');
        expect(post.body).to.be.a('string');
        expect(post.tags).to.be.an('array');
        expect(post.user).to.be.a('number');
        expect(post.user).to.equal(data.users[0].id);

        data.posts.push(post);

        done();
      });
    });

    it('should retrieve a post by it\'s id and populate it\'s tags and user', function (done) {
      collections.post.findOneById(data.posts[0].id).

      populate('tags').
      populate('user').

      exec(function (err, post) {
        expect(err).to.be.null;

        expect(post).to.be.an('object');
        expect(post.title).to.be.a('string');
        expect(post.body).to.be.a('string');

        expect(post.tags).to.be.an('array');

        post.tags.forEach(function (tag) {
          expect(tag).to.be.an('object');
          expect(tag.name).to.be.a('string');
          expect(tag.id).to.be.a('number');
        });

        expect(post.user).to.be.an('object');
        expect(post.user.name).to.be.a('string');
        expect(post.user.email).to.be.a('string');
        expect(post.user.age).to.be.a('number');
        expect(post.user.id).to.be.a('number');

        data.posts.push(post);

        done();
      });
    });

    it('should remove a post', function (done) {
      collections.post.destroy({
        id: data.posts[0].id
      }).

      exec(function (err) {
        expect(err).to.be.null;

        done();
      });
    });
  });

  describe('adapter', function () {
    it('should drop all created tables', function (done) {
      collections.user.query(
        'USE ' + credentials.database + ' EXEC sp_MSforeachtable @command1 = "DROP TABLE ?"',

        function (err) {
          expect(err).to.be.null;
          done();
        }
      );
    });
  });

});
