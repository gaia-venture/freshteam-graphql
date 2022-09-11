const { ApolloServerBase,  isHttpQueryError, runHttpQuery } = require('apollo-server-core');
const { apolloServerArgs } = require("apollo-freshteam");

function buildRequest({__ow_method, __ow_body, __ow_headers, __ow_path, __ow_isBase64Encoded, ...body}) {
  return {
    method: __ow_method.toUpperCase(),
    path: __ow_path,
    headers: __ow_headers,
    body: __ow_body
            ? (__ow_isBase64Encoded ? Buffer.from(__ow_body, 'base64').toString() : __ow_body)
            : body
  }
}

class ApolloServer extends ApolloServerBase {
  serverlessFramework() {
    return true;
  }

  createGraphQLServerOptions(req) {
    return super.graphQLServerOptions({ req });
  }

  createHandler() {
    return async (args) => {
      try {
        const request = buildRequest(args);

        if (request.method === 'POST' && !request.body) {
          return {
            body: 'POST body missing.',
            status: 400,
          };
        }

        await this.ensureStarted();
        const options = await this.createGraphQLServerOptions(request);
        const { graphqlResponse, responseInit } = await runHttpQuery(
          [request],
          {
            method: request.method,
            options: options,
            query: request.body,
            request: {
              url: request.path,
              method: request.method,
              headers: new Headers(request.headers),
            },
          },
          this.csrfPreventionRequestHeaders,
        )
        return {
          body: graphqlResponse,
          status: responseInit.status || 200,
          headers: responseInit.headers,
        }
      } catch(error) {
        if (isHttpQueryError(error)) {
          return {
            body: error.message,
            status: error.statusCode,
            headers: error.headers,
          };
        } else {
          throw error;
        }
      }
    }
  }
}

exports.main = new ApolloServer(apolloServerArgs).createHandler();