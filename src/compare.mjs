const STATUS_RANK = { valid: 0, unknown: 1, upcoming: 2, expired: 3, inactive: 4 };

function statusOf(record, at) {
  if (record.state !== 'active') return 'inactive';
  const time = Date.parse(at);
  if (Date.parse(record.price.effectiveFrom) > time) return 'upcoming';
  if (!record.price.validityKnown) return 'unknown';
  if (record.price.effectiveTo != null && Date.parse(record.price.effectiveTo) < time) return 'expired';
  return 'valid';
}

function toOffer(record, status) {
  return {
    region: record.region,
    amount: record.price.amount,
    currency: record.price.currency,
    kind: record.price.kind,
    validFrom: record.price.validFrom,
    validUntil: record.price.validUntil,
    observedAt: record.observedAt,
    status,
  };
}

// 按 (型号, 规格) 分组，让采购按地区、规格和价格有效期比较报价。
// 没有有效报价的地区也会列出最近一次记录及其状态（如“促销已结束”），
// 而不是把缓存里的旧促销价当成现价。
export function compareOffers(store, { at } = {}) {
  const when = at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(when))) {
    throw new Error(`比较时刻无效: ${when}`);
  }
  const current = store.current({ at: when });
  const groups = new Map();

  const ensureGroup = (record) => {
    const key = JSON.stringify([record.model, record.spec]);
    if (!groups.has(key)) {
      groups.set(key, { model: record.model, spec: record.spec, offers: [], bestByCurrency: {} });
    }
    return groups.get(key);
  };

  for (const record of current.values()) {
    ensureGroup(record).offers.push(toOffer(record, 'valid'));
  }
  for (const [key, record] of store.latest()) {
    if (current.has(key)) continue;
    ensureGroup(record).offers.push(toOffer(record, statusOf(record, when)));
  }

  for (const group of groups.values()) {
    group.offers.sort((a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      a.amount - b.amount ||
      a.region.localeCompare(b.region, 'zh-Hans-CN'));
    for (const offer of group.offers) {
      if (offer.status !== 'valid') continue;
      const best = group.bestByCurrency[offer.currency];
      if (!best || offer.amount < best.amount) {
        group.bestByCurrency[offer.currency] = { region: offer.region, amount: offer.amount };
      }
    }
  }

  return {
    at: when,
    groups: [...groups.values()].sort(
      (a, b) => a.model.localeCompare(b.model, 'zh-Hans-CN') || a.spec.localeCompare(b.spec, 'zh-Hans-CN'),
    ),
  };
}
