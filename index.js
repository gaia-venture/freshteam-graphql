const {FreshteamGraphQLServer} = require("apollo-freshteam");

// The `listen` method launches a web server.
FreshteamGraphQLServer.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}graphql`);
});
