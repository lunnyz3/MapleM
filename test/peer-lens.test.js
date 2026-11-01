const test = require("node:test");
const assert = require("node:assert/strict");
const { standing, gradeOf, niceStep, distribution, lensOf, innerIndex } = require("../src/domain/stats/peer-lens");

const asc = (list) => Float64Array.from(list).sort();

test("동급 비교: 위에서 몇 번째(같은 값은 같은 순위, 배열에 없으면 나를 더해 센다)", () => {
  assert.deepEqual(standing(asc([1, 2, 3, 4, 5]), 4), { rank: 2, total: 5, top: 40 });
  assert.deepEqual(standing(asc([1, 3, 3, 5]), 3), { rank: 2, total: 4, top: 50 });
  assert.deepEqual(standing(asc([1, 2, 3]), 9), { rank: 1, total: 4, top: 25 });
  assert.equal(standing(asc([1, 2]), 0), null);
  assert.equal(standing(asc([]), 3), null);
});

test("동급 비교: 잠재 등급 색 경계와 둥근 간격", () => {
  assert.deepEqual([10, 10.1, 25, 25.1, 60, 60.1].map(gradeOf), ["legendary", "unique", "unique", "epic", "epic", "rare"]);
  assert.equal(niceStep(1.3e7), 2e7);
  assert.equal(niceStep(1e7), 1e7);
  assert.equal(niceStep(4.2), 5);
});

test("동급 비교: 분포 10칸 안팎·내 칸·다음 칸까지 남은 값", () => {
  const values = asc(Array.from({ length: 100 }, (_, i) => (i + 1) * 1e6));
  const dist = distribution(values, 55e6);
  assert.equal(dist.edges[1] - dist.edges[0], 1e7);
  assert.equal(dist.counts.length, 10);
  assert.equal(dist.edges.length, 11);
  assert.equal(dist.counts.reduce((a, b) => a + b, 0), 100);
  assert.equal(dist.mine, 5);
  assert.equal(dist.next, 5e6);
  // 가장 높은 칸이면 다음 칸이 없다
  assert.equal(distribution(values, 99e6).next, null);
  // 아주 넓게 퍼진 값은 14칸을 넘지 않게 간격을 키운다
  assert.ok(distribution(values, 5e9).counts.length <= 14);
});

test("동급 비교: 넓게 퍼진 전투력은 1·2·5 단계 구간", () => {
  // 100만 ~ 5억 사이에 고르게(로그) 퍼진 무리
  const values = asc(Array.from({ length: 300 }, (_, i) => Math.round(1e6 * 500 ** (i / 299))));
  const dist = distribution(values, 1.65e8, { log: true });
  assert.deepEqual(dist.edges, [1e6, 2e6, 5e6, 1e7, 2e7, 5e7, 1e8, 2e8, 5e8]);
  assert.equal(dist.counts.reduce((a, b) => a + b, 0), 300);
  assert.equal(dist.mine, 6);
  assert.equal(dist.next, 2e8 - 1.65e8);
  // 좁게 모인 무리는 log 를 줘도 같은 간격
  const narrow = distribution(asc(Array.from({ length: 50 }, (_, i) => 1e8 + i * 1e6)), 1.2e8, { log: true });
  assert.equal(narrow.edges[2] - narrow.edges[1], narrow.edges[1] - narrow.edges[0]);
});

test("동급 비교: 무리 하나(전투력을 모르면 템환산으로), 적은 무리는 흐리게", () => {
  const group = { power: asc(Array.from({ length: 40 }, (_, i) => (i + 1) * 1e7)), item: asc(Array.from({ length: 50 }, (_, i) => i + 1)) };
  const lens = lensOf(group, { power: 35e7, score: 10 });
  assert.equal(lens.power.rank, 6);
  assert.equal(lens.power.grade, "unique");
  assert.equal(lens.item.rank, 41);
  assert.equal(lens.dist.metric, "power");
  assert.equal(lens.thin, false);
  const unknown = lensOf(group, { power: 0, score: 10 });
  assert.equal(unknown.power, null);
  assert.equal(unknown.dist.metric, "item");
  assert.equal(lensOf({ power: asc([1e7, 2e7]), item: asc([]) }, { power: 2e7, score: 0 }).thin, true);
  assert.equal(lensOf(null, { power: 1, score: 1 }), null);
});

test("내실 지수: 같은 레벨대·템환산 ±2점, 모자라면 ±4점·10레벨, 그래도 적으면 표본 부족", () => {
  const point = 10;
  const peers = Array.from({ length: 40 }, (_, i) => ({ level: 285 + (i % 5), score: 990 + (i % 21), power: (i + 1) * 1e7 }));
  const result = innerIndex(peers, { level: 287, score: 1000, power: 30e7 }, point);
  assert.equal(result.enough, true);
  assert.equal(result.widened, false);
  assert.equal(result.rank, 11);
  assert.equal(result.total, 40);
  assert.equal(result.median, 20.5e7);
  assert.equal(result.diff, 9.5e7);
  assert.deepEqual(result.level, { from: 285, to: 289 });

  const wide = [
    ...Array.from({ length: 20 }, (_, i) => ({ level: 286, score: 1000, power: (i + 1) * 1e7 })),
    ...Array.from({ length: 15 }, (_, i) => ({ level: 281, score: 1035, power: (i + 1) * 1e7 }))
  ];
  const widened = innerIndex(wide, { level: 287, score: 1000, power: 10e7 }, point);
  assert.equal(widened.widened, true);
  assert.equal(widened.sample, 35);
  assert.deepEqual(widened.level, { from: 280, to: 289 });

  // 최상위권: ±8점·20레벨까지 넓힌다
  const top = Array.from({ length: 20 }, (_, i) => ({ level: 290 + (i % 10), score: 1070 - (i % 5), power: (i + 1) * 1e7 }));
  const far = innerIndex(top, { level: 287, score: 1000, power: 15e7 }, point);
  assert.equal(far.enough, true);
  assert.deepEqual(far.level, { from: 280, to: 299 });
  assert.equal(far.score.points, 8);

  const few = innerIndex(peers.slice(0, 5), { level: 287, score: 1000, power: 30e7 }, point);
  assert.equal(few.enough, false);
  assert.equal(innerIndex(peers, { level: 287, score: 1000, power: 0 }, point), null);
});
