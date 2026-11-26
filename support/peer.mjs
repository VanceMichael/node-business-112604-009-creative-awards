import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const home = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(path.join(home, '../data/peer.json'), 'utf8'));
const statePath = path.resolve(process.env.PEER_STATE || '.local/peer-state.json');
await mkdir(path.dirname(statePath), { recursive: true });
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = { requests: {}, plans: {} }; }
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
async function save() {
  await writeFile(statePath + '.tmp', JSON.stringify(state));
  await rename(statePath + '.tmp', statePath);
}
function reply(response, code, body) {
  response.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
async function bodyOf(request) {
  let data = '';
  for await (const chunk of request) {
    data += chunk;
    if (data.length > 1024 * 1024) throw new Error('请求过大');
  }
  return JSON.parse(data || '{}');
}
let serial = Promise.resolve();
const server = http.createServer((request, response) => {
  serial = serial.then(async () => {
    const url = new URL(request.url, 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (request.method === 'GET' && url.pathname === '/health') return reply(response, 200, { name: config.name, ok: true });
    if (request.headers['x-peer-key'] !== 'local-synthetic-peer') return reply(response, 401, { error: '需要本地联调标识' });
    if (request.method === 'GET' && segments[0] === 'requests' && segments.length === 2) {
      const item = Object.hasOwn(state.requests, segments[1]) ? state.requests[segments[1]] : undefined;
      return reply(response, item ? 200 : 404, item || { error: '流水不存在' });
    }
    if (request.method === 'GET' && url.pathname === '/admin/requests') return reply(response, 200, Object.values(state.requests));
    const body = await bodyOf(request);
    if (request.method === 'PUT' && segments[0] === 'admin' && segments[1] === 'plans' && segments.length === 3) {
      if (!['normal', 'disconnectAfterAccept'].includes(body.mode)) return reply(response, 422, { error: '联调模式无效' });
      state.plans[segments[2]] = { mode: body.mode, result: body.result ?? { status: 'accepted' } };
      await save(); return reply(response, 200, { stored: true });
    }
    if (request.method === 'PUT' && segments[0] === 'admin' && segments[1] === 'results' && segments.length === 3) {
      const item = state.requests[segments[2]];
      if (!item) return reply(response, 404, { error: '流水不存在' });
      item.result = body; await save(); return reply(response, 200, item);
    }
    if (request.method === 'POST' && segments[0] === 'operations' && segments.length === 2) {
      const operation = segments[1];
      if (!config.operations.includes(operation)) return reply(response, 404, { error: '操作不存在' });
      if (typeof body.requestId !== 'string' || !/^[\w.-]{1,100}$/.test(body.requestId)) return reply(response, 422, { error: '需要稳定流水号' });
      const digest = fingerprint({ operation, body });
      const existing = Object.hasOwn(state.requests, body.requestId) ? state.requests[body.requestId] : undefined;
      if (existing) return reply(response, existing.digest === digest ? 200 : 409,
        existing.digest === digest ? existing : { error: '流水号已用于其他请求' });
      const plan = state.plans[body.requestId] || { mode: 'normal', result: { status: 'accepted' } };
      const item = { requestId: body.requestId, operation, body, digest, result: plan.result, acceptedAt: new Date().toISOString() };
      state.requests[body.requestId] = item;
      await save();
      if (plan.mode === 'disconnectAfterAccept') { request.socket.destroy(); return; }
      return reply(response, 200, item);
    }
    reply(response, 404, { error: '路径不存在' });
  }).catch(error => {
    if (!response.headersSent && !response.destroyed) reply(response, error instanceof SyntaxError ? 400 : 500, { error: error instanceof SyntaxError ? 'JSON 格式无效' : '联调端处理失败' });
  });
});
server.listen(Number(process.env.PEER_PORT || 4300), process.env.PEER_HOST || '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ message: '联调接收端已启动', port: server.address().port }) + '\n');
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
