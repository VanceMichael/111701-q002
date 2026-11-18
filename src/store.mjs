// 归档键：(型号, 规格, 地区)。地区在键内，任何页面都碰不到其他地区的记录。
export function keyOf(record) {
  return JSON.stringify([record.model, record.spec, record.region]);
}

function fingerprint(record) {
  return JSON.stringify([
    keyOf(record),
    record.observedAt,
    record.revision,
    record.price.amount,
    record.price.kind,
    record.price.effectiveFrom,
    record.price.effectiveTo,
  ]);
}

function isNewer(candidate, current) {
  const candidateTime = Date.parse(candidate.observedAt);
  const currentTime = Date.parse(current.observedAt);
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.revision > current.revision;
}

export function isValidAt(record, at) {
  if (record.state !== 'active') return false;
  const time = Date.parse(at);
  if (Date.parse(record.price.effectiveFrom) > time) return false;
  if (record.price.effectiveTo != null && Date.parse(record.price.effectiveTo) < time) return false;
  return true;
}

export class RecordStore {
  #history = new Map();
  #seen = new Set();

  // 追加式保存：记录只进入历史，不覆盖任何已有记录；
  // 迟到的旧页面因此无法顶掉仍有效的价格。重复采集同一记录会被去重。
  save(record) {
    const key = keyOf(record);
    const mark = fingerprint(record);
    if (!this.#seen.has(mark)) {
      this.#seen.add(mark);
      const records = this.#history.get(key) ?? [];
      records.push(structuredClone(record));
      this.#history.set(key, records);
    }
    return structuredClone(record);
  }

  list() {
    return [...this.#history.values()].flat().map((record) => structuredClone(record));
  }

  // 每个键下观察时间最新的一条记录（不论是否仍在有效期），用于展示失效报价。
  latest() {
    const result = new Map();
    for (const [key, records] of this.#history) {
      let best = records[0];
      for (const record of records) {
        if (isNewer(record, best)) best = record;
      }
      result.set(key, structuredClone(best));
    }
    return result;
  }

  // 指定时刻仍在有效期内的记录：每个键取观察时间最新的一条。
  current({ at } = {}) {
    const when = at ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(when))) {
      throw new Error(`比较时刻无效: ${when}`);
    }
    const result = new Map();
    for (const [key, records] of this.#history) {
      let best = null;
      for (const record of records) {
        if (!isValidAt(record, when)) continue;
        if (!best || isNewer(record, best)) best = record;
      }
      if (best) result.set(key, structuredClone(best));
    }
    return result;
  }
}
