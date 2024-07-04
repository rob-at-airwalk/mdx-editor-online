const { RedisPersistence } = require("y-redis");

const Y = require("yjs");

const config = {
  redisOpts: {
    url: "redis://localhost:6379",
  },
};

const persistence = new RedisPersistence(config);

persistence.writeState = async (name, doc) => {
  persistence.docs.delete(name)
};


module.exports.persistence = persistence;
