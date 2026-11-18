import test from 'node:test';
import assert from 'node:assert/strict';
import { compareOffers } from '../src/compare.mjs';
import { collect } from '../src/pipeline.mjs';
import { readSources } from '../src/source.mjs';
import { RecordStore } from '../src/store.mjs';

const AT = '2026-11-18T12:00:00.000Z';

const huabei = {
  source: 'huabei-site',
  region: '华北',
  observedAt: '2026-11-18T08:05:00.000Z',
  items: [
    {
      id: 'HB-XJ100-500', label: '鲜精 XJ-100 500克装', model: 'XJ-100', spec: '500g',
      state: 'active', revision: 4,
      price: {
        amount: 36.5, currency: 'CNY', kind: 'promo',
        validFrom: '2026-11-01T00:00:00.000Z', validUntil: '2026-11-10T23:59:59.000Z',
      },
    },
    {
      id: 'HB-XJ100-1KG', label: '鲜精 XJ-100 1千克装', model: 'XJ-100', spec: '1kg',
      state: 'active', revision: 2,
      price: { amount: 79, currency: 'CNY', kind: 'regular' },
    },
  ],
};

const huadong = {
  source: 'huadong-site',
  region: '华东',
  observedAt: '2026-11-18T08:10:00.000Z',
  items: [
    {
      id: 'HD-XJ100-500', label: '鲜精 XJ-100 500克装', model: 'XJ-100', spec: '500g',
      state: 'active', revision: 6,
      price: { amount: 42, currency: 'CNY', kind: 'regular' },
    },
    {
      id: 'HD-XJ100-1KG', label: '鲜精 XJ-100 1千克装', model: 'XJ-100', spec: '1kg',
      state: 'active', revision: 3,
      price: {
        amount: 75, currency: 'CNY', kind: 'promo',
        validFrom: '2026-11-15T00:00:00.000Z', validUntil: '2026-11-30T23:59:59.000Z',
      },
    },
  ],
};

// 华东站点的缓存旧页：采集于 11-04，促销 11-05 已结束，最后才到达。
const huadongLate = {
  source: 'huadong-site',
  region: '华东',
  observedAt: '2026-11-04T08:00:00.000Z',
  items: [
    {
      id: 'HD-XJ100-500', label: '鲜精 XJ-100 500克装', model: 'XJ-100', spec: '500g',
      state: 'active', revision: 5,
      price: {
        amount: 33, currency: 'CNY', kind: 'promo',
        validFrom: '2026-11-01T00:00:00.000Z', validUntil: '2026-11-05T23:59:59.000Z',
      },
    },
  ],
};

test('端到端：按地区、规格与有效期比较，旧缓存页不覆盖有效价', async () => {
  const store = new RecordStore();
  const result = await collect({ sources: async () => [huabei, huadong, huadongLate], store });
  assert.equal(result.pages, 3);
  // 三条页面共 5 条记录全部进入历史，包括迟到的旧页
  assert.equal(store.list().length, 5);

  const report = compareOffers(store, { at: AT });
  const g500 = report.groups.find((g) => g.model === 'XJ-100' && g.spec === '500g');
  const g1kg = report.groups.find((g) => g.model === 'XJ-100' && g.spec === '1kg');

  // 华东 500g：常规价 42 有效，迟到的旧促销页没有顶掉它
  const hd500 = g500.offers.find((o) => o.region === '华东');
  assert.equal(hd500.status, 'valid');
  assert.equal(hd500.amount, 42);
  assert.equal(hd500.kind, 'regular');

  // 华北 500g：缓存页上的促销 11-10 已结束，标注为失效而非当前价
  const hb500 = g500.offers.find((o) => o.region === '华北');
  assert.equal(hb500.status, 'expired');
  assert.equal(hb500.amount, 36.5);
  assert.equal(hb500.validUntil, '2026-11-10T23:59:59.000Z');

  // 最优价只取有效报价
  assert.deepEqual(g500.bestByCurrency.CNY, { region: '华东', amount: 42 });

  // 1kg：华东促销 75 在有效期内，是最优价但明确标注为促销及截止日
  const hd1kg = g1kg.offers.find((o) => o.region === '华东');
  assert.equal(hd1kg.status, 'valid');
  assert.equal(hd1kg.kind, 'promo');
  assert.equal(hd1kg.validUntil, '2026-11-30T23:59:59.000Z');
  assert.deepEqual(g1kg.bestByCurrency.CNY, { region: '华东', amount: 75 });
});

test('促销截止后比较视图随之变化', async () => {
  const store = new RecordStore();
  await collect({ sources: async () => [huabei, huadong, huadongLate], store });
  const report = compareOffers(store, { at: '2026-12-01T00:00:00.000Z' });
  const g1kg = report.groups.find((g) => g.spec === '1kg');
  // 华东 1kg 促销已于 11-30 结束，最优价变为华北常规价 79
  assert.equal(g1kg.offers.find((o) => o.region === '华东').status, 'expired');
  assert.deepEqual(g1kg.bestByCurrency.CNY, { region: '华北', amount: 79 });
});

test('页面到达顺序不影响比较结果', async () => {
  const first = new RecordStore();
  const second = new RecordStore();
  await collect({ sources: async () => [huabei, huadong, huadongLate], store: first });
  await collect({ sources: async () => [huadongLate, huabei, huadong], store: second });
  assert.deepEqual(compareOffers(first, { at: AT }), compareOffers(second, { at: AT }));
});

test('仓库自带样例数据可完整走通采集链', async () => {
  const pages = await readSources();
  assert.ok(pages.length >= 3);
  const store = new RecordStore();
  await collect({ sources: async () => pages, store });
  const report = compareOffers(store, { at: AT });
  assert.ok(report.groups.length >= 2);
});
