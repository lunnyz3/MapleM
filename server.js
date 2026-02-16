const { createApp } = require("./src/app");
const { connectMongo } = require("./src/config/mongo");
const { env } = require("./src/config/env");

const app = createApp();

app.listen(env.port, () => {
  console.log(`Server running at http://localhost:${env.port}`);
  connectMongo();
});
