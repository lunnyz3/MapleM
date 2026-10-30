const test = require("node:test");
const assert = require("node:assert/strict");

test("CSV: BOM, 머리글, 쉼표·따옴표·줄바꿈 감싸기, 빈 값", async () => {
  const { toCsv } = await import("../web/src/lib/csv.mjs");
  const csv = toCsv([
    ["이름", "전투력", "메모"],
    ["피카츄", 123456789, 'a,b "c"'],
    ["라이츄", null, "줄\n바꿈"]
  ]);
  assert.equal(csv, '﻿이름,전투력,메모\r\n피카츄,123456789,"a,b ""c"""\r\n라이츄,,"줄\n바꿈"\r\n');
});
