import { normalizePage } from './adapter.mjs';
import { compareOffers } from './compare.mjs';
import { readSources } from './source.mjs';
import { RecordStore } from './store.mjs';

export async function collect({ sources = readSources, store = new RecordStore() } = {}) {
  const pages = await sources();
  const records = [];
  for (const page of pages) {
    for (const record of normalizePage(page)) {
      records.push(store.save(record));
    }
  }
  return { pages: pages.length, records, store };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // 可选参数：比较时刻（ISO 时间），缺省为当前时刻。
  const at = process.argv[2];
  const { store } = await collect();
  const report = compareOffers(store, at ? { at } : {});
  console.log(JSON.stringify(report, null, 2));
}
