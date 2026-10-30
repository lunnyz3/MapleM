const { createApp } = require("./src/app");
const { connectMongo } = require("./src/config/mongo");
const { env } = require("./src/config/env");
const { itemCollector } = require("./src/jobs/item-collection.job");
const { powerPatrol } = require("./src/jobs/power-patrol.job");
const { bossReach, hallOfFame } = require("./src/services/stats.service");
const { upgradeNews } = require("./src/services/news.service");

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
  // 오늘의 강화 소식(첫 화면 카드·전광판 축하 문구)도 미리
  setTimeout(() => upgradeNews().catch(() => {}), 20000).unref();
  // 보스 입장 가능 비율(캐릭터 보스 탭)은 모은 캐릭터를 다 읽어 몇 초 걸린다
  setTimeout(() => bossReach().catch(() => {}), 40000).unref();
  if (env.itemCollectionEnabled && env.nexonApiKey) {
    itemCollector.start();
  }
  // 전투력 순찰: 모은 캐릭터의 전투력을 한 시간마다 다시 읽어 보스 세팅으로 바꿔 낀 때의 값을 남긴다.
  if (env.powerPatrolEnabled && env.nexonApiKey) {
    powerPatrol.start();
  }
});
