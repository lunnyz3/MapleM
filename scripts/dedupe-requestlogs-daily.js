require("dotenv").config();

const mongoose = require("mongoose");
const { env } = require("../src/config/env");
const { RequestLog } = require("../src/models/request-log.model");

const applyChanges = process.argv.includes("--apply");
const showHelp = process.argv.includes("--help") || process.argv.includes("-h");
const deleteBatchSize = 500;
const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getKstDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return kstDateFormatter.format(date);
}

function getDocumentScore(doc) {
  const mode = String(doc?.responseBody?.mode || "");
  let score = doc?.success ? 1000 : 0;

  if (mode === "all") {
    score += 400;
  } else if (mode === "page-data") {
    score += 300;
  }

  if (/\/maplestorym\/v1\/character\/all$/.test(String(doc?.endpoint || ""))) {
    score += 50;
  }

  return score;
}

function chooseDocumentToKeep(group) {
  return group.reduce((best, doc) => {
    if (!best) {
      return doc;
    }

    const scoreDifference = getDocumentScore(doc) - getDocumentScore(best);
    if (scoreDifference > 0) {
      return doc;
    }
    if (scoreDifference < 0) {
      return best;
    }

    return new Date(doc.createdAt) > new Date(best.createdAt) ? doc : best;
  }, null);
}

async function deleteInBatches(ids) {
  let deletedCount = 0;
  for (let index = 0; index < ids.length; index += deleteBatchSize) {
    const batch = ids.slice(index, index + deleteBatchSize);
    const result = await RequestLog.deleteMany({ _id: { $in: batch } });
    deletedCount += result.deletedCount || 0;
  }
  return deletedCount;
}

async function finalizeGroup(group, stats) {
  if (!group.length) {
    return;
  }

  const keep = chooseDocumentToKeep(group);
  const deleteIds = group
    .filter((doc) => String(doc._id) !== String(keep._id))
    .map((doc) => doc._id);
  const snapshotDate = getKstDate(keep.createdAt);

  stats.dailyGroups += 1;
  stats.documentsToDelete += deleteIds.length;

  if (!applyChanges) {
    return;
  }

  stats.deletedDocuments += await deleteInBatches(deleteIds);
  await RequestLog.updateOne(
    { _id: keep._id },
    { $set: { snapshotDate } }
  );
}

async function readCollectionStats() {
  try {
    const result = await mongoose.connection.db.command({
      collStats: RequestLog.collection.collectionName,
      scale: 1024 * 1024
    });
    return {
      count: result.count,
      sizeMb: result.size,
      storageSizeMb: result.storageSize
    };
  } catch {
    return null;
  }
}

async function main() {
  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is not set.");
  }

  console.log(applyChanges ? "[APPLY] 실제 중복 삭제를 시작합니다." : "[DRY RUN] 데이터는 삭제하지 않습니다.");
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5,
    retryWrites: true,
    autoIndex: false
  });

  const beforeStats = await readCollectionStats();
  if (beforeStats) {
    console.log(
      `현재 requestlogs: ${Number(beforeStats.count || 0).toLocaleString()}건, ` +
      `데이터 약 ${Number(beforeStats.sizeMb || 0).toFixed(1)}MB, ` +
      `할당 약 ${Number(beforeStats.storageSizeMb || 0).toFixed(1)}MB`
    );
  }

  const stats = {
    scannedDocuments: 0,
    skippedDocuments: 0,
    dailyGroups: 0,
    documentsToDelete: 0,
    deletedDocuments: 0
  };
  const cursor = RequestLog.find({
    characterName: { $nin: ["", null] },
    worldName: { $nin: ["", null] },
    createdAt: { $type: "date" }
  })
    .select({
      _id: 1,
      characterName: 1,
      worldName: 1,
      ocid: 1,
      endpoint: 1,
      statusCode: 1,
      success: 1,
      "responseBody.mode": 1,
      createdAt: 1
    })
    .sort({ characterName: 1, worldName: 1, createdAt: -1 })
    .lean()
    .cursor();

  let currentKey = "";
  let currentGroup = [];
  for await (const doc of cursor) {
    stats.scannedDocuments += 1;
    const snapshotDate = getKstDate(doc.createdAt);
    if (!snapshotDate) {
      stats.skippedDocuments += 1;
      continue;
    }

    const key = `${doc.characterName}\u0000${doc.worldName}\u0000${snapshotDate}`;
    if (currentKey && key !== currentKey) {
      await finalizeGroup(currentGroup, stats);
      currentGroup = [];
    }

    currentKey = key;
    currentGroup.push(doc);
  }
  await finalizeGroup(currentGroup, stats);

  console.log(`검사: ${stats.scannedDocuments.toLocaleString()}건`);
  console.log(`캐릭터별 일일 그룹: ${stats.dailyGroups.toLocaleString()}개`);
  console.log(`삭제 대상: ${stats.documentsToDelete.toLocaleString()}건`);
  if (stats.skippedDocuments) {
    console.log(`날짜 오류로 건너뜀: ${stats.skippedDocuments.toLocaleString()}건`);
  }

  if (applyChanges) {
    console.log(`실제 삭제 완료: ${stats.deletedDocuments.toLocaleString()}건`);
    const afterStats = await readCollectionStats();
    if (afterStats) {
      console.log(
        `정리 후 requestlogs: ${Number(afterStats.count || 0).toLocaleString()}건, ` +
        `데이터 약 ${Number(afterStats.sizeMb || 0).toFixed(1)}MB`
      );
    }
  } else {
    console.log("결과를 확인한 뒤 실제 적용: npm run db:dedupe-daily -- --apply");
  }
}

if (require.main === module && showHelp) {
  console.log("미리보기: npm run db:dedupe-daily");
  console.log("실제 적용: npm run db:dedupe-daily -- --apply");
} else if (require.main === module) {
  main()
    .catch((error) => {
      console.error("[정리 실패]", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
    });
}

module.exports = {
  getKstDate,
  getDocumentScore,
  chooseDocumentToKeep
};
