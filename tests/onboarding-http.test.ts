// Real owned loopback HTTP traffic, not mocked fetch or enterprise scanning.
// 实际自有回环HTTP请求，不mock fetch，不扫描企业网络。
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, type Server, type RequestListener} from 'node:http';
import {probeHttpMetadata, type DiscoveryProbeAuthority} from '../src/onboarding/http-metadata-probe.ts';
const csdl = JSON.stringify({$Version: '4.01', Owned: {
  Row: {$Kind: 'EntityType', $Key: ['Id'], Id: {$Type: 'Edm.String', $Nullable: false}},
}});
async function owned(handler: RequestListener) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {server, url: 'http://127.0.0.1:' + address.port + '/$metadata'};
}
async function stop(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
function permission(url: string, phases: string[] = []): DiscoveryProbeAuthority {
  return {async check(endpoint, phase) {assert.equal(endpoint, url); phases.push(phase);}};
}
test('actual GET identifies OData with pre/post checks and no credentials / 真GET识别且前后核权', async () => {
  let hits = 0;
  const x = await owned((req, res) => {
    hits++; assert.equal(req.method, 'GET'); assert.equal(req.url, '/$metadata');
    assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    res.writeHead(200, {'Content-Type': 'application/json'}); res.end(csdl);
  });
  try {
    const phases: string[] = [], result = await probeHttpMetadata(x.url, permission(x.url, phases));
    assert.equal(result.status, 'observed'); assert.equal(result.observation?.protocol, 'odata-json-csdl');
    assert.equal('evidenceCommitted' in result && result.evidenceCommitted, false);
    assert.equal(result.observation?.readAuthorized, false); assert.equal(hits, 1);
    assert.deepEqual(phases, ['before_request', 'before_accept']);
  } finally {await stop(x.server);}
});
test('denied scope sends zero requests and redacts authority errors / 拒绝范围零请求并脱敏', async () => {
  let hits = 0; const x = await owned((_req, res) => {hits++; res.end(csdl);});
  try {
    const result = await probeHttpMetadata(x.url, {async check() {throw Error('PRIVATE-TOKEN');}});
    assert.equal(result.status, 'unavailable'); assert.equal(hits, 0);
    assert.equal(JSON.stringify(result).includes('PRIVATE-TOKEN'), false);
  } finally {await stop(x.server);}
});
test('revocation during response prevents evidence acceptance / 响应途中撤权不接受结果', async () => {
  let revoked = false, phases: string[] = [];
  const x = await owned((_req, res) => {revoked = true; res.writeHead(200, {'Content-Type': 'application/json'}); res.end(csdl);});
  try {
    const result = await probeHttpMetadata(x.url, {async check(_endpoint, phase) {
      phases.push(phase); if (revoked) throw Error('revoked');
    }});
    assert.equal(result.status, 'unavailable'); assert.equal(result.observation, null);
    assert.deepEqual(phases, ['before_request', 'before_accept']);
  } finally {await stop(x.server);}
});
test('redirect is never followed to a second service / 不跟随重定向到第二服务', async () => {
  let secondHits = 0; const second = await owned((_req, res) => {secondHits++; res.end(csdl);});
  const first = await owned((_req, res) => {res.writeHead(302, {Location: second.url}); res.end();});
  try {
    const result = await probeHttpMetadata(first.url, permission(first.url));
    assert.equal(result.observation?.code, 'redirect_not_followed'); assert.equal(secondHits, 0);
  } finally {await stop(first.server); await stop(second.server);}
});
test('auth response produces a gap rather than a connection / 认证响应产生待办不当连接', async () => {
  const x = await owned((_req, res) => {res.writeHead(401, {'Content-Type': 'application/json'}); res.end('{"secret":"PRIVATE"}');});
  try {
    const result = await probeHttpMetadata(x.url, permission(x.url));
    assert.equal(result.observation?.outcome, 'needs_authorization');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  } finally {await stop(x.server);}
});
test('size and compressed-body refusal applies before classification / 超大及压缩响应先拒绝', async () => {
  for (const mode of ['large', 'compressed']) {
    const x = await owned((_req, res) => {
      res.writeHead(200, {'Content-Type': 'application/json', ...(mode === 'compressed' ? {'Content-Encoding': 'gzip'} : {})});
      res.end('x'.repeat(mode === 'large' ? 270000 : 10));
    });
    try {
      const result = await probeHttpMetadata(x.url, permission(x.url));
      assert.equal(result.status, 'unavailable'); assert.equal(result.observation, null);
    } finally {await stop(x.server);}
  }
});
test('invalid UTF8 is refused / 拒绝错误UTF8', async () => {
  const x = await owned((_req, res) => {res.writeHead(200, {'Content-Type': 'application/json'}); res.end(Buffer.from([0xff]));});
  try {
    const result = await probeHttpMetadata(x.url, permission(x.url));
    assert.equal(result.status, 'unavailable'); assert.equal('code' in result && result.code, 'discovery_response_encoding_invalid');
  } finally {await stop(x.server);}
});
test('pre-cancelled request sends nothing / 事先取消零请求', async () => {
  let hits = 0; const x = await owned((_req, res) => {hits++; res.end(csdl);});
  try {
    const signal = AbortSignal.abort();
    const result = await probeHttpMetadata(x.url, permission(x.url), signal);
    assert.equal(result.status, 'unavailable'); assert.equal(hits, 0);
    assert.equal('code' in result && result.code, 'discovery_cancelled');
  } finally {await stop(x.server);}
});
test('in-flight cancellation ends only the owned request / 请求中取消仅结束自有请求', async () => {
  let arrived!: () => void; const ready = new Promise<void>(resolve => {arrived = resolve;});
  const x = await owned((_req, res) => {res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{'); arrived();});
  try {
    const control = new AbortController(), pending = probeHttpMetadata(x.url, permission(x.url), control.signal);
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([ready, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(Error('owned_request_did_not_arrive')), 2000);
      })]);
    } finally {if (timer) clearTimeout(timer); control.abort();}
    const result = await pending;
    assert.equal(result.status, 'unavailable'); assert.equal('code' in result && result.code, 'discovery_cancelled');
  } finally {await stop(x.server);}
});
test('absolute request deadline ends a nonresponsive service / 绝对截止时间结束无响应请求', async () => {
  const x = await owned(() => {});
  try {
    const start = Date.now(), result = await probeHttpMetadata(x.url, permission(x.url));
    assert.equal(result.status, 'unavailable'); assert.equal('code' in result && result.code, 'discovery_request_deadline');
    assert.ok(Date.now() - start < 8000);
  } finally {await stop(x.server);}
});
test('hostname, metadata and public addresses are not enabled / 不启用主机名元数据与公网目标', async () => {
  let called = 0; const authority = {async check() {called++;}};
  for (const url of ['http://localhost/meta', 'http://169.254.169.254/meta', 'http://8.8.8.8/meta',
    'http://0.0.0.0/meta', 'http://224.0.0.1/meta', 'http://192.168.1.255/meta', 'http://[::1]/meta'])
    await assert.rejects(probeHttpMetadata(url, authority));
  assert.equal(called, 0);
});
test('opaque numeric aliases cannot reach the owned server / 隐晦数字IP别名不得到达服务', async () => {
  let hits = 0, checks = 0;
  const x = await owned((_req, res) => {hits++; res.end(csdl);});
  try {
    const port = new URL(x.url).port;
    await assert.rejects(probeHttpMetadata('http://2130706433:' + port + '/$metadata', {
      async check() {checks++;},
    }), /discovery_endpoint_invalid/);
    assert.equal(checks, 0); assert.equal(hits, 0);
  } finally {await stop(x.server);}
});
