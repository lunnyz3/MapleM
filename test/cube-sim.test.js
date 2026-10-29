const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../web/src/lib/cubeSim.mjs");
const sequence = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const table = {
  grades: {
    유니크: [[{ option: "A", value: "1%", p: 75 }, { option: "B", value: "2%", p: 25 }], [{ option: "C", value: "3%", p: 100 }], [{ option: "C", value: "3%", p: 100 }]],
    레전더리: [[{ option: "L", value: "9%", p: 100 }], [{ option: "L2", value: "8%", p: 100 }], [{ option: "L2", value: "8%", p: 100 }]]
  }
};

test("큐브: 줄마다 공식 p 비율로 고르고, 첫 줄은 first·나머지는 second/third 표", async () => {
  const { rollCube, pickWeighted } = await load();
  assert.equal(pickWeighted(table.grades.유니크[0], () => 0.74).option, "A");
  assert.equal(pickWeighted(table.grades.유니크[0], () => 0.76).option, "B");
  // 첫 수 = 등급 상승 판정(0.5 > 2% → 그대로), 다음부터 줄
  const result = rollCube(table, "유니크", { lineCount: 3, gradeUp: 0.02, random: sequence([0.5, 0.9, 0.1, 0.1]) });
  assert.deepEqual(result, { grade: "유니크", gradeUp: false, lines: [{ name: "B", value: "2%" }, { name: "C", value: "3%" }, { name: "C", value: "3%" }] });
});

test("큐브: 등급 상승 확률에 걸리면 다음 등급 표로 굴린다, 최고 등급이면 그대로", async () => {
  const { rollCube } = await load();
  const up = rollCube(table, "유니크", { lineCount: 2, gradeUp: 0.02, random: sequence([0.01, 0.3, 0.3]) });
  assert.equal(up.grade, "레전더리");
  assert.equal(up.gradeUp, true);
  assert.deepEqual(up.lines.map((line) => line.name), ["L", "L2"]);
  const top = rollCube(table, "레전더리", { lineCount: 1, gradeUp: 1, random: sequence([0, 0.5]) });
  assert.equal(top.grade, "레전더리");
  assert.equal(top.gradeUp, false);
});

test("불꽃: 둘째 줄은 two_option_chance, 수치는 범위 안 step 단위", async () => {
  const { rollFlame } = await load();
  const flame = { twoOptionChance: 0.5, options: [{ option: "물리공격력", p: 50, min: 1609, max: 1931, step: 1, percent: false }, { option: "최종 대미지 증가", p: 50, min: 5.4, max: 6.3, step: 0.1, percent: true }] };
  const one = rollFlame(flame, sequence([0.9, 0.1, 0.999999]));
  assert.deepEqual(one, [{ name: "물리공격력", value: "1,931" }]);
  const two = rollFlame(flame, sequence([0.1, 0.9, 0, 0.9, 0.5]));
  assert.equal(two.length, 2);
  assert.deepEqual(two[0], { name: "최종 대미지 증가", value: "5.4%" });
  assert.equal(two[1].name, "최종 대미지 증가");
  assert.match(two[1].value, /^5\.[89]%$/);
});

test("효율: 좋아질 확률·평균 개수·좋아졌을 때 평균 상승을 굴려서 센다", async () => {
  const { cubeEfficiency } = await load();
  let i = 0;
  // 4번에 1번만 좋아진다(+0.02), 나머지는 나빠진다
  const result = cubeEfficiency({
    roll: () => [{ name: "x", value: String(i++ % 4 === 0 ? 2 : -1) }],
    ratioOf: (lines) => 1 + Number(lines[0]?.value || 0) / 100,
    current: [{ name: "x", value: "0" }],
    samples: 400
  });
  assert.equal(result.chance, 0.25);
  assert.equal(result.cubes, 4);
  assert.ok(Math.abs(result.gainWhenBetter - 0.02) < 1e-12);
  assert.ok(Math.abs(result.gainPerCube - 0.005) < 1e-12);
});
