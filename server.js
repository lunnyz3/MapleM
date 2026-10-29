const { createApp } = require("./src/app");
const { connectMongo } = require("./src/config/mongo");
const { env } = require("./src/config/env");
const { itemCollector } = require("./src/jobs/item-collection.job");
const { hallOfFame } = require("./src/services/stats.service");

const app = createApp();

app.listen(env.port, (error) => {
  if (error) {
    console.error(`[Server] Failed to listen on port ${env.port}:`, error.message);
    return;
  }

  console.log(`Server running at http://localhost:${env.port}`);
  connectMongo();
  // 명예의 전당은 계산에 몇 초 걸려 미리 만들어 둔다.
  setTimeout(() => hallOfFame().catch(() => {}), 60000).unref();
  if (env.itemCollectionEnabled && env.nexonApiKey) {
    itemCollector.start();
  }
});
