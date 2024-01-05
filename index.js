import {App} from "octokit";

const app = new App({
  appId: process.env.GH_APP_ID,
  privateKey: process.env.GH_PRIVATE_KEY,
})

exports.handler = async (event) => {

  const method = event.requestContext.http.method;
  const queryParams = event.queryStringParameters;
  console.log(`http.method: ${method}`)
  console.log(`queryStringParameters: ${queryParams}`)
  console.log(`body: ${event.body}`)

  return {
    statusCode: 200, // default value
    body: JSON.stringify({
      received: true,
    }),
  };
};