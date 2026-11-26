import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { once } from 'node:events';

const config = JSON.parse(await readFile(new URL('../data/peer.json', import.meta.url)));
const headers = { 'content-type': 'application/json', 'x-peer-key': 'local-synthetic-peer' };
async function start(statePath) {
  const child = spawn(process.execPath, ['support/peer.mjs'], { env: { ...process.env, PEER_STATE: statePath, PEER_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = readline.createInterface({ input: child.stdout });
  const failed = new Promise((_, reject) => child.once('exit', code => reject(new Error('联调端提前退出：' + code))));
  const line = await Promise.race([once(lines, 'line').then(([value]) => value), failed]);
  const base = 'http://127.0.0.1:' + JSON.parse(line).port;
  return { base, async stop() { const ended = once(child, 'exit'); child.kill('SIGTERM'); await ended; lines.close(); } };
}
test('受理后断连的流水可查询、可重发且可在重启后继续核实', { timeout: 15000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'peer-'));
  const statePath = path.join(temporary, 'state.json');
  let peer = await start(statePath);
  try {
    const requestId = 'receipt-17';
    const result = { status: 'pending', externalId: 'external-17' };
    const plan = await fetch(peer.base + '/admin/plans/' + requestId, { method: 'PUT', headers, body: JSON.stringify({ mode: 'disconnectAfterAccept', result }) });
    assert.equal(plan.status, 200);
    const body = { requestId, entity: 'synthetic-17', revision: 1 };
    await assert.rejects(fetch(peer.base + '/operations/' + config.operations[0], { method: 'POST', headers, body: JSON.stringify(body) }));
    const queried = await fetch(peer.base + '/requests/' + requestId, { headers }).then(r => r.json());
    assert.deepEqual(queried.result, result);
    const repeated = await fetch(peer.base + '/operations/' + config.operations[0], { method: 'POST', headers, body: JSON.stringify({ revision: 1, entity: 'synthetic-17', requestId }) });
    assert.equal(repeated.status, 200);
    const changed = await fetch(peer.base + '/operations/' + config.operations[0], { method: 'POST', headers, body: JSON.stringify({ ...body, revision: 2 }) });
    assert.equal(changed.status, 409);
    await peer.stop(); peer = await start(statePath);
    const reloaded = await fetch(peer.base + '/requests/' + requestId, { headers }).then(r => r.json());
    assert.deepEqual(reloaded.body, body);
    await fetch(peer.base + '/admin/results/' + requestId, { method: 'PUT', headers, body: JSON.stringify({ status: 'completed', externalId: 'external-17' }) });
    assert.equal((await fetch(peer.base + '/requests/' + requestId, { headers }).then(r => r.json())).result.status, 'completed');
    assert.equal((await fetch(peer.base + '/admin/requests', { headers }).then(r => r.json())).length, 1);
    assert.equal((await fetch(peer.base + '/admin/requests')).status, 401);
    assert.equal((await fetch(peer.base + '/requests/absent', { headers })).status, 404);
  } finally { await peer.stop(); await rm(temporary, { recursive: true, force: true }); }
});
