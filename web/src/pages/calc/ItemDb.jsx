// 아이템 DB 탭: 제네시스·아케인셰이드 아이템의 스타포스 단계별 기본 옵션(추가 옵션을 뺀 값).
// 표는 수집 장비로 만든 src/game-data/item-db.json(처음 열 때 따로 내려받는다).
import { useEffect, useMemo, useState } from "preact/hooks";
import { Icon } from "../../components/Icon.jsx";
import { Skeleton } from "../../components/Skeleton.jsx";
import { formatComma } from "../../lib/format.js";

export function ItemDbCalc() {
  const [db, setDb] = useState(/** @type {any} */ (null));
  const [name, setName] = useState("아케인셰이드 완드");
  useEffect(() => {
    let alive = true;
    import("../../../../src/game-data/item-db.json").then(
      (module) => alive && setDb(module.default || module),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, []);
  // 장비 대여 아이템은 빼고, 계열별로 묶는다.
  const groups = useMemo(() => {
    const out = new Map();
    for (const [itemName, entry] of Object.entries(db?.items || {})) {
      if (itemName.startsWith("[")) continue;
      const list = out.get(entry.family) || [];
      list.push(itemName);
      out.set(entry.family, list);
    }
    return [...out.entries()];
  }, [db]);
  if (!db) return <Skeleton height={320} radius={16} />;
  const entry = db.items[name] || db.items[groups[0]?.[1]?.[0]];
  const current = db.items[name] ? name : groups[0]?.[1]?.[0];
  const stars = Object.keys(entry?.stars || {})
    .map(Number)
    .sort((a, b) => a - b);
  const options = [...new Set(stars.flatMap((star) => Object.keys(entry.stars[star])))];

  return (
    <div class="calc-grid calc-grid--single">
      <section class="card calc-card">
        <h2 class="calc-card__title">아이템 DB · 스타포스 단계별 기본 옵션</h2>
        <div class="field">
          <label class="field__label" for="itemdb-name">
            아이템
          </label>
          <span class="select">
            <select id="itemdb-name" value={current} onChange={(event) => setName(/** @type {HTMLSelectElement} */ (event.currentTarget).value)}>
              {groups.map(([family, names]) => (
                <optgroup key={family} label={family}>
                  {names.map((itemName) => (
                    <option key={itemName} value={itemName}>
                      {itemName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Icon name="chevronDown" size={18} class="select__icon" />
          </span>
        </div>
        <div class="calc-table-wrap">
          <table class="calc-table">
            <thead>
              <tr>
                <th scope="col">스타포스</th>
                {options.map((option) => (
                  <th key={option} scope="col">
                    {option}
                  </th>
                ))}
                <th scope="col">이전 단계보다</th>
              </tr>
            </thead>
            <tbody>
              {stars.map((star, index) => {
                const row = entry.stars[star];
                const prev = index ? entry.stars[stars[index - 1]] : null;
                const main = options.reduce((best, option) => ((row[option] || 0) > (row[best] || 0) ? option : best), options[0]);
                const gain = prev && prev[main] !== undefined && stars[index - 1] === star - 1 ? row[main] - prev[main] : null;
                return (
                  <tr key={star}>
                    <td class="num">★{star}</td>
                    {options.map((option) => (
                      <td key={option} class="num">
                        {row[option] !== undefined ? formatComma(row[option]) : "-"}
                      </td>
                    ))}
                    <td class="num">{gain !== null ? `+${formatComma(gain)}` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="calc-note">{db._meta?.verification} 추가 옵션을 뺀 값이고, 표에 없는 단계는 모은 장비가 적은 단계예요.</p>
      </section>
    </div>
  );
}
