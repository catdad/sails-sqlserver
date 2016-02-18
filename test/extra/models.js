module.exports = [
  /* USER */
  {
    tableName: 'users',

    identity: 'user',

    attributes: {
      name: {
        type: 'string',
        required: true
      },

      email: {
        type: 'email',
        required: true,
        unique: true,
        size: 255,
      },

      age: 'integer',

      posts: {
        collection: 'post',
        via: 'user'
      }
    }
  },

  /* POST */
  {
    tableName: 'posts',

    identity: 'post',

    attributes: {
      title: {
        type: 'string',
        required: true
      },

      body: {
        type: 'text',
        required: true
      },

      user: {
        model: 'user',
        required: true
      },

      tags: {
        collection: 'tag',
        via: 'posts',
        dominant: true,
        required: true
      }
    }
  },

  /* TAG */
  {
    tableName: 'tags',

    identity: 'tag',

    attributes: {
      name: {
        type: 'string',
        required: true,
        unique: true,
        size: 50
      },

      posts: {
        collection: 'post',
        via: 'tags'
      }
    }
  }
];
