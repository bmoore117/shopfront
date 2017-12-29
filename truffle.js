module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!

  networks: {
    development: { // This one is optional and reduces the scope for failing fast
      host: "localhost",
      port: 7545,
      network_id: "5777" // Match any network id
    }
  }
};
