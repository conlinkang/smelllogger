import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../official-form-runner/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(root, `.${relativePath}`);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    response.end(fs.readFileSync(filePath));
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function mapsStub() {
  return `(() => {
    class MockMap { constructor(element) { element.dataset.mapReady = 'true'; } panTo() {} }
    class Marker { constructor() {} setPosition() {} }
    class Rectangle { constructor() {} setOptions() {} }
    class LatLng { constructor(lat, lng) { this.lat = () => lat; this.lng = () => lng; } }
    class Geocoder { geocode(options, callback) { callback([{ formatted_address: '雲林縣斗六市科福一街156號3樓' }], 'OK'); } }
    class OverlayView { setMap() {} getPanes() { return { overlayLayer: document.createElement('div') }; } getProjection() { return { fromLatLngToDivPixel: () => ({ x: 0, y: 0 }) }; } }
    window.google = { maps: { Map: MockMap, Marker, Rectangle, LatLng, Geocoder, OverlayView, event: { addListener() {} } } };
    window.__smellLoggerMapsReady();
  })();`;
}

async function configureRoutes(page, state) {
  await page.route('**/maps.googleapis.com/maps/api/js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: mapsStub()
  }));
  await page.route('**/api.open-meteo.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ current: { temperature_2m: 29.4, wind_speed_10m: 1.8, wind_direction_10m: 135 } })
  }));
  await page.route('**/script.google.com/**', route => {
    if (route.request().method() === 'POST') {
      state.platformPayload = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
  await page.route('**/smelllogger-runner-*.run.app/submit', route => {
    state.officialPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'manual_required', code: 'READY_FOR_FINAL_REVIEW', pageUrl: 'https://ww3.moenv.gov.tw/Public/Case_Add.aspx' })
    });
  });
}

async function openIndex(browser, state, { withLocation = true } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...(withLocation ? {
      geolocation: { latitude: 23.713179, longitude: 120.50558 },
      permissions: ['geolocation']
    } : {})
  });
  const page = await context.newPage();
  await configureRoutes(page, state);
  await page.goto(`${state.baseUrl}/index_test.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#map')?.dataset.mapReady === 'true');
  await page.waitForTimeout(500);
  return { context, page };
}

const server = await startStaticServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
try {
  const noLocationState = { baseUrl, platformPayload: null, officialPayload: null };
  const noLocation = await openIndex(browser, noLocationState, { withLocation: false });
  assert.equal(await noLocation.page.locator('#submitButton').isDisabled(), true, 'submit button must be disabled before a location is selected');
  assert.equal(await noLocation.page.locator('#submitButton').innerText(), '請先完成定位');
  await noLocation.context.close();

  const namedState = { baseUrl, platformPayload: null, officialPayload: null };
  const named = await openIndex(browser, namedState);
  const namedButtonBox = await named.page.locator('#submitButton').boundingBox();
  assert.ok(namedButtonBox && namedButtonBox.y >= 0, 'submit button must be rendered at the end of the form');
  await named.page.locator('#submitButton').scrollIntoViewIfNeeded();
  assert.equal(await named.page.locator('#submitButton').isVisible(), true, 'submit button must be reachable after reviewing the form');
  const formOrder = await named.page.evaluate(() => ['map', 'checkLocation', 'submitButton'].map(id => document.getElementById(id)?.getBoundingClientRect().top || -1));
  assert.ok(formOrder[0] < formOrder[1] && formOrder[1] < formOrder[2], 'map, checklist, and submit controls should follow the review order');
  await named.page.locator('#reporterName').fill('integration-test');
  await named.page.locator('#reporterPhone').fill('0900000000');
  await named.page.locator('#reporterEmail').fill('integration@example.com');
  await named.page.locator('#reporterAddress').fill('雲林縣斗六市科福一街156號');
  await named.page.locator('#officialSubmissionConfirmed').check();
  assert.equal(await named.page.locator('#submitButton').innerText(), '送出平台紀錄＋環境部填單');
  assert.equal(await named.page.locator('#submitButton').isDisabled(), false);
  await named.page.locator('#submitButton').click();
  await named.page.waitForTimeout(700);
  assert.equal(namedState.officialPayload?.mode, 'submit');
  assert.equal(namedState.officialPayload?.reporter?.name, 'integration-test');
  assert.equal(namedState.officialPayload?.complaint?.officialForm?.pollutionCounty, '雲林縣');
  assert.match(await named.page.locator('#message').innerText(), /人工確認階段/);
  assert.equal(await named.page.locator('#officialReviewPanel').isVisible(), true, 'formal submit fallback should show the manual review panel');
  assert.equal(await named.page.locator('#officialSimulationPanel').isVisible(), false, 'formal submit fallback should not show the prepare simulation panel');
  assert.equal(await named.page.locator('#smellTime').isDisabled(), true, 'system-recorded smell time should not be editable');
  assert.equal(JSON.stringify(namedState.platformPayload).includes('0900000000'), false);
  assert.equal(JSON.stringify(namedState.platformPayload).includes('integration@example.com'), false);
  await named.context.close();

  const platformOnlyState = { baseUrl, platformPayload: null, officialPayload: null };
  const platformOnly = await openIndex(browser, platformOnlyState);
  await platformOnly.page.locator('#reporterName').fill('partial-reporter');
  assert.equal(await platformOnly.page.locator('#submitButton').innerText(), '送出平台紀錄');
  assert.equal(await platformOnly.page.locator('#submitButton').isDisabled(), false);
  await platformOnly.page.locator('#submitButton').click();
  await platformOnly.page.waitForTimeout(700);
  assert.equal(platformOnlyState.platformPayload?.reporter, undefined);
  assert.equal(platformOnlyState.officialPayload, null);
  assert.match(await platformOnly.page.locator('#message').innerText(), /只送出平台紀錄/);
  await platformOnly.context.close();

  console.log('browser-integration: PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
