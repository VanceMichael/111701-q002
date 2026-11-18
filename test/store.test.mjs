import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordStore } from '../src/store.mjs';

function offer(overrides = {}) {
  const { price, ...rest } = overrides;
  return {
    source: 'unit',
    region: '华东',
    id: 'A',
    model: 'XJ-100',
    spec: '500g',
    name: '样例',
    state: 'active',
    revision: 1,
    observedAt: '2026-11-18T08:00:00.000Z',
    price: {
      amount: 42,
      currency: 'CNY',
      kind: 'regular',
      validFrom: null,
      validUntil: null,
      validityKnown: true,
      effectiveFrom: '2026-11-18T08:00:00.000Z',
      effectiveTo: null,
      ...price,
    },
    ...rest,
  };
}

test('迟到的旧页面不会顶掉同地区当前有效价', () => {
  const store = new RecordStore();
  store.save(offer({ revision: 6 }));
  store.save(offer({
    revision: 5,
    observedAt: '2026-11-04T08:00:00.000Z',
    price: {
      amount: 33,
      kind: 'promo',
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-11-05T23:59:59.000Z',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      effectiveTo: '2026-11-05T23:59:59.000Z',
    },
  }));
  const current = store.current({ at: '2026-11-18T12:00:00.000Z' });
  assert.equal(current.size, 1);
  assert.equal([...current.values()][0].price.amount, 42);
  // 旧页面仍保留在历史中，可审计
  assert.equal(store.list().length, 2);
});

test('促销结束后回退到常规价；促销期内取促销价', () => {
  const store = new RecordStore();
  store.save(offer({
    observedAt: '2026-11-01T08:00:00.000Z',
    price: { amount: 40, effectiveFrom: '2026-11-01T08:00:00.000Z' },
  }));
  store.save(offer({
    observedAt: '2026-11-15T08:00:00.000Z',
    price: {
      amount: 35,
      kind: 'promo',
      validFrom: '2026-11-15T00:00:00.000Z',
      validUntil: '2026-11-20T23:59:59.000Z',
      effectiveFrom: '2026-11-15T00:00:00.000Z',
      effectiveTo: '2026-11-20T23:59:59.000Z',
    },
  }));
  assert.equal([...store.current({ at: '2026-11-18T12:00:00.000Z' }).values()][0].price.amount, 35);
  assert.equal([...store.current({ at: '2026-11-21T12:00:00.000Z' }).values()][0].price.amount, 40);
});

test('已结束的促销即使是最新观察也不会成为当前价', () => {
  const store = new RecordStore();
  store.save(offer({
    observedAt: '2026-11-18T08:05:00.000Z',
    price: {
      amount: 36.5,
      kind: 'promo',
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-11-10T23:59:59.000Z',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      effectiveTo: '2026-11-10T23:59:59.000Z',
    },
  }));
  assert.equal(store.current({ at: '2026-11-18T12:00:00.000Z' }).size, 0);
});

test('地区相互隔离：一个地区的迟到页面不影响其他地区', () => {
  const store = new RecordStore();
  store.save(offer({ region: '华北', price: { amount: 79 } }));
  store.save(offer({ region: '华东', price: { amount: 42 } }));
  // 华东的迟到旧页（已结束促销）最后到达
  store.save(offer({
    region: '华东',
    observedAt: '2026-11-04T08:00:00.000Z',
    price: {
      amount: 33,
      kind: 'promo',
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-11-05T23:59:59.000Z',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      effectiveTo: '2026-11-05T23:59:59.000Z',
    },
  }));
  const current = store.current({ at: '2026-11-18T12:00:00.000Z' });
  const byRegion = new Map([...current.values()].map((r) => [r.region, r.price.amount]));
  assert.equal(byRegion.get('华北'), 79);
  assert.equal(byRegion.get('华东'), 42);
});

test('重复采集同一记录不会产生重复历史', () => {
  const store = new RecordStore();
  store.save(offer());
  store.save(offer());
  assert.equal(store.list().length, 1);
});

test('同一观察时刻按修订号取新', () => {
  const store = new RecordStore();
  store.save(offer({ revision: 1, price: { amount: 43 } }));
  store.save(offer({ revision: 2, price: { amount: 41 } }));
  assert.equal([...store.current({ at: '2026-11-18T12:00:00.000Z' }).values()][0].price.amount, 41);
});

test('非在售状态的记录不参与当前价', () => {
  const store = new RecordStore();
  store.save(offer({ state: 'pending' }));
  assert.equal(store.current({ at: '2026-11-18T12:00:00.000Z' }).size, 0);
});
