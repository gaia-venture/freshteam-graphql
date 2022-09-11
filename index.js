const {ApolloServer} = require("apollo-server");
const {apolloServerArgs} = require("apollo-freshteam");

// The `listen` method launches a web server.
new ApolloServer(apolloServerArgs).listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}graphql`);
});
