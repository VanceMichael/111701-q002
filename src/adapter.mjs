const PRICE_KINDS = new Map([
  ['regular', 'regular'],
  ['promo', 'promo'],
  ['promotion', 'promo'],
]);

export function normalizeSpec(value) {
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

function parseInstant(value, field) {
  let text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    // 只写日期时：起始日按当天开始、截止日按当天结束计。
    text = field === 'validUntil' ? `${text}T23:59:59.999Z` : `${text}T00:00:00.000Z`;
  }
  const time = Date.parse(text);
  if (Number.isNaN(time)) {
    throw new Error(`时间字段 ${field} 不是有效的 ISO 时间: ${value ?? ''}`);
  }
  return new Date(time).toISOString();
}

function normalizePrice(raw, observedAt) {
  if (raw == null || typeof raw !== 'object') {
    throw new Error('来源记录缺少 price');
  }
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('price.amount 必须是非负数字');
  }
  const currency = String(raw.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('price.currency 必须是三字母 ISO 代码');
  }
  const kind = PRICE_KINDS.get(String(raw.kind ?? '').trim().toLowerCase());
  if (!kind) {
    throw new Error('price.kind 必须是 regular 或 promo');
  }
  const validFrom = raw.validFrom != null ? parseInstant(raw.validFrom, 'validFrom') : null;
  const validUntil = raw.validUntil != null ? parseInstant(raw.validUntil, 'validUntil') : null;
  if (validFrom && validUntil && validFrom > validUntil) {
    throw new Error('price.validFrom 不能晚于 price.validUntil');
  }
  return {
    amount,
    currency,
    kind,
    validFrom,
    validUntil,
    // 没写截止日期的促销按“有效期未知”处理：有效窗口收敛到采集时刻，
    // 避免缓存旧页把促销价顶成当前价、被采购当成长期价。
    validityKnown: kind === 'regular' || validUntil != null,
    effectiveFrom: validFrom ?? observedAt,
    effectiveTo: validUntil ?? (kind === 'promo' ? observedAt : null),
  };
}

export function normalizePage(page) {
  if (page == null || typeof page !== 'object') {
    throw new Error('来源页格式不正确');
  }
  const region = String(page.region ?? '').trim();
  if (!region) {
    throw new Error('来源页缺少 region');
  }
  const observedAt = parseInstant(page.observedAt, 'observedAt');
  if (!Array.isArray(page.items)) {
    throw new Error('来源页缺少 items');
  }
  const source = String(page.source ?? region);
  return page.items.map((item) => {
    const name = String(item?.label ?? '').trim();
    const model = String(item?.model ?? '').trim();
    const spec = normalizeSpec(item?.spec ?? '');
    if (item?.id == null || !name || !model || !spec) {
      throw new Error('来源记录缺少 id、label、model 或 spec');
    }
    const revision = Number(item.revision ?? 0);
    return {
      source,
      region,
      id: String(item.id),
      model,
      spec,
      name,
      state: String(item.state ?? 'active').trim().toLowerCase() || 'active',
      revision: Number.isFinite(revision) ? revision : 0,
      observedAt,
      price: normalizePrice(item.price, observedAt),
    };
  });
}
