const { FreshteamGraphQLServer } = require("apollo-freshteam");

async function main(args) {
  const context = { req: { headers: args.__ow_headers } };
  console.log(context);
  console.log(args);
  try {
    const results = await FreshteamGraphQLServer.executeOperation({query: args.query, variables: args.variables}, context);
    console.log(results);
    return {"body": results}
  } catch(e) {
    return {
      code: 500,
      body: { errors: [e.message] }
    };
  }
}

exports.main = main;
