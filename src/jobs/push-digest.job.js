// 즐겨찾기 알림 저녁 묶음: 날마다 20시(서울)에 따라가는 길드의 오늘 들고 남, 내일 끝나는 이벤트를 보낸다. server.js 에서만 시작한다.
const mongoose = require("mongoose");
const { PushSubscription } = require("../models/push-subscription.model");
const { GuildRoster } = require("../models/guild-roster.model");
const { eventCalendar } = require("../services/event-calendar.service");
const { isEnabled, kstDate, notifyEvents, notifyGuild } = require("../services/push.service");
const { eventsMessage, guildMessage } = require("../domain/community/push-messages");

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_KST = 20;

/** 다음 20시(서울)까지 남은 시간 */
function untilNextRun(now = Date.now()) {
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const target = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), HOUR_KST) - 9 * 60 * 60 * 1000;
  return target > now ? target - now : target + DAY_MS - now;
}

async function digestOnce() {
  const today = kstDate();
  let guilds = 0;
  const followed = await PushSubscription.aggregate([{ $unwind: "$follows.guilds" }, { $group: { _id: { world: "$follows.guilds.world", name: "$follows.guilds.name" } } }]);
  for (const { _id: guild } of followed) {
    const roster = await GuildRoster.findOne({ worldName: guild.world, guildName: guild.name }, { _id: 0, events: { $slice: -1 } }).lean();
    const event = roster?.events?.[0];
    if (!event || event.date !== today || (!event.joined.length && !event.left.length)) continue;
    guilds += await notifyGuild({ worldName: guild.world, guildName: guild.name, ...guildMessage({ world: guild.world, guild: guild.name, joined: event.joined, left: event.left }) });
  }
  const ending = (await eventCalendar().catch(() => ({ events: [] }))).events.filter((event) => event.status === "ongoing" && event.daysLeft === 1);
  const events = ending.length ? await notifyEvents(eventsMessage(ending)) : 0;
  return { guilds, events, ending: ending.length };
}

let timer = null;
const pushDigestJob = {
  start() {
    if (timer) return;
    const run = async () => {
      if (isEnabled() && mongoose.connection.readyState === 1) {
        try {
          const result = await digestOnce();
          console.log(`[push-digest] guild notices ${result.guilds}, event notices ${result.events} (${result.ending} ending tomorrow)`);
        } catch (error) {
          console.error("[push-digest] failed:", error?.message || error);
        }
      }
      timer = setTimeout(run, untilNextRun());
      timer.unref?.();
    };
    timer = setTimeout(run, untilNextRun());
    timer.unref?.();
  },
  digestOnce,
  untilNextRun
};

module.exports = { pushDigestJob };
