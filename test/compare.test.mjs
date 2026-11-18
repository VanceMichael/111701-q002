import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOffers } from '../src/compare.mjs';
import { RecordStore } from '../src/store.mjs';

const AT = '2026-11-18T12:00:00.000Z';

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

test('比较视图按型号与规格分组，同型号不同规格互不混淆', () => {
  const store = new RecordStore();
  store.save(offer({ spec: '500g', price: { amount: 42 } }));
  store.save(offer({ spec: '1kg', price: { amount: 79 } }));
  const report = compareOffers(store, { at: AT });
  assert.equal(report.groups.length, 2);
  assert.deepEqual(report.groups.map((g) => g.spec), ['1kg', '500g']);
});

test('有效报价参与最优价，已结束促销标注状态且不参与', () => {
  const store = new RecordStore();
  store.save(offer({ region: '华东', price: { amount: 42 } }));
  store.save(offer({
    region: '华北',
    price: {
      amount: 36.5,
      kind: 'promo',
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-11-10T23:59:59.000Z',
      effectiveFrom: '2026-11-01T00:00:00.000Z',
      effectiveTo: '2026-11-10T23:59:59.000Z',
    },
  }));
  const report = compareOffers(store, { at: AT });
  const group = report.groups[0];
  const huadong = group.offers.find((o) => o.region === '华东');
  const huabei = group.offers.find((o) => o.region === '华北');
  assert.equal(huadong.status, 'valid');
  assert.equal(huabei.status, 'expired');
  assert.equal(huabei.validUntil, '2026-11-10T23:59:59.000Z');
  assert.deepEqual(group.bestByCurrency.CNY, { region: '华东', amount: 42 });
});

test('有效期未知的促销不参与最优价', () => {
  const store = new RecordStore();
  store.save(offer({ region: '华东', price: { amount: 42 } }));
  store.save(offer({
    region: '华北',
    price: {
      amount: 30,
      kind: 'promo',
      validityKnown: false,
      effectiveTo: '2026-11-18T08:00:00.000Z',
    },
  }));
  const report = compareOffers(store, { at: AT });
  const group = report.groups[0];
  assert.equal(group.offers.find((o) => o.region === '华北').status, 'unknown');
  assert.deepEqual(group.bestByCurrency.CNY, { region: '华东', amount: 42 });
});

test('最优价按币种分别计算', () => {
  const store = new RecordStore();
  store.save(offer({ region: '华东', price: { amount: 42, currency: 'CNY' } }));
  store.save(offer({ region: '华北', price: { amount: 6, currency: 'USD' } }));
  const report = compareOffers(store, { at: AT });
  const group = report.groups[0];
  assert.deepEqual(group.bestByCurrency.CNY, { region: '华东', amount: 42 });
  assert.deepEqual(group.bestByCurrency.USD, { region: '华北', amount: 6 });
});
