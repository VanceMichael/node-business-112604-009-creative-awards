import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const load = async name => JSON.parse(await readFile(new URL('../data/' + name, import.meta.url)));
const catalog = await load('catalog.json');
const records = await load('records.json');
const peer = await load('peer.json');
assert.equal(catalog.synthetic, true, '资料需明确为合成数据');
assert.equal(records.synthetic, true, '记录需明确为合成数据');
assert.ok(records.records.length > 0, '业务记录不可为空');
assert.equal(new Set(records.records.map(r => r.recordId)).size, records.records.length, '记录编号不可重复');
for (const record of records.records) { assert.equal(typeof record.kind, 'string'); assert.equal(typeof record.payload, 'object'); }
assert.ok(peer.operations.length > 0, '联调操作不可为空');
assert.equal(new Set(peer.operations).size, peer.operations.length, '联调操作不可重复');
for (const t of catalog.tracks) assert.equal(Object.values(t.weights).reduce((a,b) => a+b,0),100);
for (const t of catalog.teams) assert.ok(t.members.includes(t.leader));
for (const j of catalog.judges) for (const person of j.conflictsWith) assert.ok(catalog.teams.some(t => t.members.includes(person)));
console.log('合成资料格式及领域引用核查通过');
