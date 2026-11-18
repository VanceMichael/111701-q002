import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePage, normalizeSpec } from '../src/adapter.mjs';

const basePage = {
  source: 'unit',
  region: '华东',
  observedAt: '2026-11-18T08:00:00.000Z',
};

function pageWith(item) {
  return { ...basePage, items: [item] };
}

test('规整记录保留地区、规格与价格有效期', () => {
  const [record] = normalizePage(pageWith({
    id: 'A-1',
    label: ' 鲜精 XJ-100 ',
    model: 'XJ-100',
    spec: ' 500G ',
    state: 'ACTIVE',
    revision: 3,
    price: {
      amount: '39.9',
      currency: 'cny',
      kind: 'promotion',
      validFrom: '2026-11-01',
      validUntil: '2026-11-20',
    },
  }));
  assert.equal(record.region, '华东');
  assert.equal(record.name, '鲜精 XJ-100');
  assert.equal(record.spec, '500g');
  assert.equal(record.state, 'active');
  assert.equal(record.price.amount, 39.9);
  assert.equal(record.price.currency, 'CNY');
  assert.equal(record.price.kind, 'promo');
  assert.equal(record.price.validFrom, '2026-11-01T00:00:00.000Z');
  assert.equal(record.price.validUntil, '2026-11-20T23:59:59.999Z');
  assert.equal(record.price.validityKnown, true);
  assert.equal(record.price.effectiveFrom, '2026-11-01T00:00:00.000Z');
  assert.equal(record.price.effectiveTo, '2026-11-20T23:59:59.999Z');
});

test('常规价未填有效期时自采集时刻起长期有效', () => {
  const [record] = normalizePage(pageWith({
    id: 'A-2',
    label: 'x',
    model: 'M',
    spec: '1kg',
    price: { amount: 10, currency: 'CNY', kind: 'regular' },
  }));
  assert.equal(record.price.effectiveFrom, '2026-11-18T08:00:00.000Z');
  assert.equal(record.price.effectiveTo, null);
  assert.equal(record.price.validityKnown, true);
});

test('没写截止日期的促销价按有效期未知处理，窗口收敛到采集时刻', () => {
  const [record] = normalizePage(pageWith({
    id: 'A-3',
    label: 'x',
    model: 'M',
    spec: '1kg',
    price: { amount: 9.9, currency: 'CNY', kind: 'promo' },
  }));
  assert.equal(record.price.validityKnown, false);
  assert.equal(record.price.effectiveTo, '2026-11-18T08:00:00.000Z');
});

test('缺少地区、规格或价格等关键字段的记录被拒绝', () => {
  assert.throws(() => normalizePage({ ...basePage, region: '', items: [] }), /region/);
  assert.throws(() => normalizePage({ ...basePage, observedAt: '不是时间', items: [] }), /observedAt/);
  assert.throws(
    () => normalizePage(pageWith({ id: 'a', label: 'x', model: 'M', price: { amount: 1, currency: 'CNY', kind: 'regular' } })),
    /spec/,
  );
  assert.throws(
    () => normalizePage(pageWith({ id: 'a', label: 'x', model: 'M', spec: '500g' })),
    /price/,
  );
  assert.throws(
    () => normalizePage(pageWith({ id: 'a', label: 'x', model: 'M', spec: '500g', price: { amount: -1, currency: 'CNY', kind: 'regular' } })),
    /amount/,
  );
  assert.throws(
    () => normalizePage(pageWith({ id: 'a', label: 'x', model: 'M', spec: '500g', price: { amount: 1, currency: 'CNY', kind: 'flash' } })),
    /kind/,
  );
  assert.throws(
    () => normalizePage(pageWith({
      id: 'a', label: 'x', model: 'M', spec: '500g',
      price: { amount: 1, currency: 'CNY', kind: 'promo', validFrom: '2026-11-20', validUntil: '2026-11-01' },
    })),
    /validFrom/,
  );
});

test('规格规整：归一大小写与空白', () => {
  assert.equal(normalizeSpec('  500G  袋装 '), '500g 袋装');
});
