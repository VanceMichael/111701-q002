import { readFile, readdir } from 'node:fs/promises';

const DEFAULT_DIR = new URL('../data/', import.meta.url);

export async function readSource(path) {
  const text = await readFile(path, 'utf8');
  const page = JSON.parse(text);
  if (page == null || typeof page !== 'object' || !Array.isArray(page.items)) {
    throw new Error('来源页缺少 items');
  }
  return page;
}

// 数据目录下每个 .json 文件是一个地区页面的快照，按文件名排序依次读取。
export async function readSources(dir = DEFAULT_DIR) {
  const names = await readdir(dir);
  const pages = [];
  for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
    pages.push(await readSource(new URL(name, dir)));
  }
  if (pages.length === 0) {
    throw new Error('数据目录中没有来源页');
  }
  return pages;
}
