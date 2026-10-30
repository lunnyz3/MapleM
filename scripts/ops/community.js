// 방문자가 올린 것 관리(운영자가 서버에서 실행): 첫 화면 전광판 글, 미니게임 이번 주 랭킹.
//
//   node scripts/ops/community.js messages [개수]        # 최근 전광판 글(숨긴 글 포함) id·시각·방문자·글
//   node scripts/ops/community.js hide <id>               # 그 글 숨기기(10초 안에 화면에서 빠진다)
//   node scripts/ops/community.js unhide <id>             # 다시 보이기
//   node scripts/ops/community.js hide-visitor <id>       # 그 글을 쓴 방문자의 글 전부 숨기기
//   node scripts/ops/community.js scores <게임> [개수]    # 이번 주 랭킹(vs guess reaction star memory quiz catch merge simon typing sf)
//   node scripts/ops/community.js remove-score <id>       # 랭킹 한 줄 지우기
//
// 운영 .env 의 MONGODB_URI 를 쓴다(MAPLEM_ENV_FILE 로 바꿀 수 있다). 비밀값은 출력하지 않는다.
const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: process.env.MAPLEM_ENV_FILE || path.join(__dirname, "..", "..", ".env"), quiet: true });

const { Megaphone } = require("../../src/models/megaphone.model");
const { GameScore } = require("../../src/models/game-score.model");
const { GAME_RULES, weekKey, valueOf } = require("../../src/domain/community/arcade-scores");

const kst = (date) => new Date(new Date(date).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(5, 16).replace("T", " ");

async function main() {
  const [command, arg, extra] = process.argv.slice(2);
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI 가 없습니다.");
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (command === "messages") {
      const docs = await Megaphone.find({}).sort({ createdAt: -1 }).limit(Number(arg) || 30).lean();
      docs.forEach((doc) => console.log(`${doc._id}  ${kst(doc.createdAt)}  ${doc.visitor || "-"}  ${doc.hidden ? "[숨김] " : ""}${doc.text}`));
      if (!docs.length) console.log("글이 없습니다.");
    } else if (command === "hide" || command === "unhide") {
      const result = await Megaphone.updateOne({ _id: arg }, { $set: { hidden: command === "hide" } });
      console.log(result.matchedCount ? `${command === "hide" ? "숨겼습니다" : "다시 보입니다"}: ${arg}` : `없는 글: ${arg}`);
    } else if (command === "hide-visitor") {
      const doc = await Megaphone.findById(arg).lean();
      if (!doc?.visitor) throw new Error(`없는 글이거나 방문자 정보가 없습니다: ${arg}`);
      const result = await Megaphone.updateMany({ visitor: doc.visitor }, { $set: { hidden: true } });
      console.log(`방문자 ${doc.visitor} 의 글 ${result.modifiedCount}개를 숨겼습니다.`);
    } else if (command === "scores") {
      if (!Object.hasOwn(GAME_RULES, arg)) throw new Error(`게임 이름: ${Object.keys(GAME_RULES).join(" ")}`);
      const week = weekKey(new Date());
      const docs = await GameScore.find({ game: arg, week }).sort({ score: -1, updatedAt: 1 }).limit(Number(extra) || 30).lean();
      console.log(`${arg} · ${week} 주`);
      docs.forEach((doc, index) => console.log(`${String(index + 1).padStart(3)}  ${doc._id}  ${kst(doc.updatedAt)}  ${doc.visitor || "-"}  ${doc.nickname}  ${valueOf(arg, doc.score)}`));
      if (!docs.length) console.log("기록이 없습니다.");
    } else if (command === "remove-score") {
      const result = await GameScore.deleteOne({ _id: arg });
      console.log(result.deletedCount ? `지웠습니다: ${arg}` : `없는 기록: ${arg}`);
    } else {
      console.log("명령: messages | hide <id> | unhide <id> | hide-visitor <id> | scores <게임> | remove-score <id>");
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
