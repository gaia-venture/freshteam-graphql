const { ApolloServer, gql } = require('apollo-server');

// A schema is a collection of type definitions (hence "typeDefs")
// that together define the "shape" of queries that are executed against
// your data.
const typeDefs = gql`
  type Pod {
    name: String
  }

  type PdgEmployee {
    name: String
    pod: Pod
  }

  type Query {
    pdgEmployees: [PdgEmployee]
  }
`;

const employees = [
  {
    id: 42,
    name: 'Kate Chopin',
    podId: 41,
  },
  {
    id: 42,
    name: 'Paul Auster',
    podId: 43
  },
];

const resolvers = {
  Query: {
    pdgEmployees: async () => employees,
  },
  PdgEmployee: {
    pod: async (parent) => ({ name: "Offtake" + parent.podId })
  }
};

const {
  ApolloServerPluginLandingPageLocalDefault
} = require('apollo-server-core');

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
const server = new ApolloServer({
  typeDefs,
  resolvers,
  csrfPrevention: true,
  cache: 'bounded',
  /**
   * What's up with this embed: true option?
   * These are our recommended settings for using AS;
   * they aren't the defaults in AS3 for backwards-compatibility reasons but
   * will be the defaults in AS4. For production environments, use
   * ApolloServerPluginLandingPageProductionDefault instead.
  **/
  plugins: [
    ApolloServerPluginLandingPageLocalDefault({ embed: true }),
  ],
});

// The `listen` method launches a web server.
server.listen().then(({ url }) => {
  console.log(`🚀  Server ready at ${url}`);
});