import assert from 'node:assert/strict';
import http from 'node:http';

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

const upstreamPayloads = [];
const upstream = http.createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    upstreamPayloads.push(JSON.parse(body || '{}'));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true }));
  });
});

const upstreamPort = await listen(upstream);
process.env.NODE_ENV = 'test';
process.env.ALLOWED_ORIGIN = 'https://conlinkang.github.io';
process.env.RECORD_UPSTREAM_URL = `http://127.0.0.1:${upstreamPort}/exec`;

const { app } = await import('../official-form-runner/server.js');
const runner = http.createServer(app);
const runnerPort = await listen(runner);
const recordUrl = `http://127.0.0.1:${runnerPort}/record`;

try {
  const platformResponse = await fetch(recordUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://conlinkang.github.io',
      'X-Forwarded-For': '203.0.113.44, 10.0.0.1'
    },
    body: JSON.stringify({ recordId: 'record_proxy_integration_20260831', lat: 23.7, lng: 120.5 })
  });
  assert.equal(platformResponse.status, 200);
  assert.deepEqual(await platformResponse.json(), { ok: true, ipRecorded: true });
  assert.equal(upstreamPayloads[0].ip, '203.0.113.44');

  const statusResponse = await fetch(recordUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://conlinkang.github.io',
      'X-Forwarded-For': '203.0.113.44'
    },
    body: JSON.stringify({
      action: 'official-submission-status',
      recordId: 'record_proxy_integration_20260831',
      status: 'email_verification_required'
    })
  });
  assert.equal(statusResponse.status, 200);
  assert.equal(Object.hasOwn(upstreamPayloads[1], 'ip'), false);
  console.log('record-proxy-integration: PASS');
} finally {
  await close(runner);
  await close(upstream);
}
