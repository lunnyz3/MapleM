const { createApp } = require("./src/app");
const { connectMongo } = require("./src/config/mongo");
const { env } = require("./src/config/env");

const app = createApp();

app.listen(env.port, (error) => {
  if (error) {
    console.error(`[Server] Failed to listen on port ${env.port}:`, error.message);
    return;
  }

  console.log(`Server running at http://localhost:${env.port}`);
  connectMongo();
});
