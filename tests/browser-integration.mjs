import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../official-form-runner/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPage = process.env.INDEX_PAGE || 'index_test.html';
const proofDir = process.env.PROOF_SCREENSHOT_DIR ? path.resolve(process.env.PROOF_SCREENSHOT_DIR) : '';
const proofCaptchaImage = process.env.PROOF_CAPTCHA_IMAGE && fs.existsSync(process.env.PROOF_CAPTCHA_IMAGE)
  ? `data:image/png;base64,${fs.readFileSync(process.env.PROOF_CAPTCHA_IMAGE).toString('base64')}`
  : '';
if (proofDir) fs.mkdirSync(proofDir, { recursive: true });
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
    window.__mapRectangles = [];
    class Rectangle {
      constructor(options) { this.options = options; this.listeners = {}; window.__mapRectangles.push(this); }
      setOptions(options) { Object.assign(this.options, options); }
    }
    class LatLng { constructor(lat, lng) { this.lat = () => lat; this.lng = () => lng; } }
    class Geocoder { geocode(options, callback) { callback([{ formatted_address: '雲林縣斗六市文化路100號3樓' }], 'OK'); } }
    class OverlayView { setMap() {} getPanes() { return { overlayLayer: document.createElement('div') }; } getProjection() { return { fromLatLngToDivPixel: () => ({ x: 0, y: 0 }) }; } }
    window.google = { maps: { Map: MockMap, Marker, Rectangle, LatLng, Geocoder, OverlayView, event: {
      addListener(target, eventName, listener) { target.listeners[eventName] = listener; }
    } } };
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
      const payload = JSON.parse(route.request().postData() || '{}');
      if (payload.action === 'official-submission-status') state.officialStatusPayload = payload;
      else state.platformPayload = payload;
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ records: [] }) });
  });
  await page.route('**/smelllogger-runner-*.run.app/prepare', route => {
    state.preparePayload = route.request().postDataJSON();
    if (state.prepareReady) {
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready_for_final_review',
          code: 'READY_FOR_FINAL_REVIEW',
          sessionId: 'integration_session_abcdefghijklmnopqrstuvwxyz123456',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          expiresInSeconds: 300
        })
      });
    }
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'captcha_required',
        code: 'CAPTCHA_REQUIRED',
        sessionId: 'integration_session_abcdefghijklmnopqrstuvwxyz123456',
        captchaImage: state.captchaImage || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=',
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        expiresInSeconds: 300
      })
    });
  });
  await page.route('**/smelllogger-runner-*.run.app/finalize', route => {
    state.finalizePayload = route.request().postDataJSON();
    state.finalizeCalls = (state.finalizeCalls || 0) + 1;
    if (state.finalizeCalls === 1) {
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'captcha_required',
          code: 'CAPTCHA_INCORRECT',
          sessionId: 'integration_session_abcdefghijklmnopqrstuvwxyz123456',
          captchaImage: state.captchaImage || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=',
          expiresAt: new Date(Date.now() + 240000).toISOString(),
          attemptsRemaining: state.prepareReady ? 3 : 2
        })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'email_verification_required', code: 'EMAIL_VERIFICATION_REQUIRED' })
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
  await page.goto(`${state.baseUrl}/${indexPage}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#map')?.dataset.mapReady === 'true');
  await page.waitForTimeout(500);
  return { context, page };
}

const server = await startStaticServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
try {
  const noLocationState = { baseUrl, platformPayload: null, preparePayload: null, finalizePayload: null };
  const noLocation = await openIndex(browser, noLocationState, { withLocation: false });
  if (indexPage === 'index_test.html' || indexPage === 'index.html') {
    assert.equal(await noLocation.page.locator('#voiceAssist').isVisible(), false, 'voice input should be collapsed by default');
    await noLocation.page.locator('#voiceInputMode').click();
    await noLocation.page.waitForFunction(() => !document.getElementById('voiceAssist')?.hidden && document.activeElement?.id === 'report-title');
    assert.equal(await noLocation.page.locator('#voiceInputMode').getAttribute('aria-expanded'), 'true');
    assert.equal(await noLocation.page.locator('#voiceAssist').isVisible(), true, 'voice input should expand after choosing voice mode');
    await noLocation.page.locator('#textInputMode').click();
    await noLocation.page.waitForFunction(() => document.getElementById('voiceAssist')?.hidden && document.activeElement?.id === 'smellLevelSection');
    assert.equal(await noLocation.page.locator('#voiceAssist').isVisible(), false, 'text mode should collapse voice input');
    assert.equal(await noLocation.page.locator('#textInputMode').getAttribute('aria-pressed'), 'true');
  }
  assert.equal(await noLocation.page.locator('#submitButton').isDisabled(), true, 'submit button must be disabled before a location is selected');
  assert.equal(await noLocation.page.locator('#submitButton').innerText(), '請先完成定位');
  const noLocationManualSelection = await noLocation.page.evaluate(() => {
    const rectangle = window.__mapRectangles[0];
    rectangle.listeners.click();
    return {
      displayed: document.getElementById('userLocation')?.textContent || '',
      selected: window.smellLoggerSelectedPosition
    };
  });
  assert.match(noLocationManualSelection.displayed, new RegExp(`${noLocationManualSelection.selected.lat.toFixed(5)}.*${noLocationManualSelection.selected.lng.toFixed(5)}`), 'manual map selection should update the displayed coordinates');
  assert.equal(await noLocation.page.locator('#submitButton').isDisabled(), false, 'manual map selection should enable platform submission');
  await noLocation.context.close();

  const namedState = { baseUrl, platformPayload: null, preparePayload: null, finalizePayload: null, finalizeCalls: 0, captchaImage: proofCaptchaImage };
  const named = await openIndex(browser, namedState);
  assert.match(await named.page.locator('#userLocation').innerText(), /23\.71318.*120\.50558/, 'GPS location should use the precise device coordinates');
  const namedManualSelection = await named.page.evaluate(() => {
    const rectangle = window.__mapRectangles[0];
    rectangle.listeners.click();
    return {
      displayed: document.getElementById('userLocation')?.textContent || '',
      selected: window.smellLoggerSelectedPosition
    };
  });
  assert.match(namedManualSelection.displayed, new RegExp(`${namedManualSelection.selected.lat.toFixed(5)}.*${namedManualSelection.selected.lng.toFixed(5)}`), 'manual selection should replace the displayed GPS coordinates');
  assert.equal(await named.page.locator('#officialReviewLink').isVisible(), false, 'official form link should be hidden before a fallback is needed');
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
  await named.page.locator('#reportDescription').fill('平台通報說明端到端測試文字。');
  await named.page.locator('#officialAttachments').setInputFiles({
    name: 'evidence.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64')
  });
  await named.page.waitForFunction(() => document.querySelector('#officialAttachmentStatus')?.textContent?.includes('已準備 1 張'));
  if (proofDir) await named.page.locator('.attachment-picker').screenshot({ path: path.join(proofDir, 'mobile-optional-attachment.png') });
  await named.page.locator('#officialSubmissionConfirmed').check();
  assert.equal(await named.page.locator('#submitButton').innerText(), '送出平台紀錄＋環境部填單');
  assert.equal(await named.page.locator('#submitButton').isDisabled(), false);
  await named.page.locator('#submitButton').click();
  await named.page.waitForTimeout(700);
  assert.equal(namedState.preparePayload?.mode, 'prepare');
  assert.equal(namedState.preparePayload?.reporter?.name, 'integration-test');
  assert.ok(Math.abs(namedState.preparePayload?.location?.lat - namedManualSelection.selected.lat) < 0.000001, 'official latitude must follow the manual map selection');
  assert.ok(Math.abs(namedState.preparePayload?.location?.lng - namedManualSelection.selected.lng) < 0.000001, 'official longitude must follow the manual map selection');
  assert.equal(namedState.preparePayload?.reporter?.address, '雲林縣斗六市科福一街156號');
  assert.match(namedState.preparePayload?.complaint?.locationAddress || '', /文化路100號附近/);
  assert.equal(namedState.preparePayload?.complaint?.description, '平台通報說明端到端測試文字。');
  assert.equal(namedState.preparePayload?.complaint?.officialForm?.pollutionCounty, '雲林縣');
  assert.equal(namedState.preparePayload?.attachments?.length, 1);
  assert.equal(namedState.preparePayload?.attachments?.[0]?.mimeType, 'image/jpeg');
  assert.equal(await named.page.locator('#officialCaptchaPanel').isVisible(), true, 'prepared form should show the CAPTCHA relay panel');
  assert.equal(await named.page.locator('#officialEmailReminder').isVisible(), true, 'official email verification reminder must be visible before final submission');
  assert.match(await named.page.locator('#officialEmailReminder').innerText(), /尚未完成報案.*收件匣.*垃圾郵件.*案件編號/s);
  if (proofDir) await named.page.locator('#officialCaptchaPanel').screenshot({ path: path.join(proofDir, 'mobile-captcha-entry.png') });
  assert.equal(await named.page.locator('#officialReviewPanel').isVisible(), false, 'manual fallback should remain hidden while CAPTCHA relay is available');
  assert.equal(await named.page.locator('#officialSimulationPanel').isVisible(), false, 'formal submit fallback should not show the prepare simulation panel');
  await named.page.locator('#officialCaptchaInput').fill('WRONG');
  await named.page.locator('#officialCaptchaSubmit').click();
  await named.page.waitForFunction(() => document.querySelector('#officialCaptchaStatus')?.textContent?.includes('重新輸入'));
  assert.equal(namedState.finalizeCalls, 1);
  assert.match(await named.page.locator('#officialCaptchaStatus').innerText(), /尚可嘗試 2 次/);
  assert.equal(await named.page.locator('#officialCaptchaInput').inputValue(), '', 'wrong CAPTCHA should clear the input for a retry');
  if (proofDir) await named.page.locator('#officialCaptchaPanel').screenshot({ path: path.join(proofDir, 'mobile-captcha-retry.png') });
  await named.page.locator('#officialCaptchaInput').fill('9N9PF');
  await named.page.locator('#officialCaptchaSubmit').click();
  await named.page.waitForFunction(() => document.querySelector('#officialCaptchaStatus')?.textContent?.includes('尚未完成報案'));
  assert.equal(namedState.finalizeCalls, 2);
  assert.equal(namedState.finalizePayload?.sessionId, 'integration_session_abcdefghijklmnopqrstuvwxyz123456');
  assert.equal(namedState.finalizePayload?.captchaText, '9N9PF');
  assert.equal(namedState.finalizePayload?.confirmationText, '我確認以本人資料正式陳情');
  if (indexPage === 'index_test.html') {
    await named.page.waitForFunction(() => document.querySelector('#message')?.textContent?.includes('分析紀錄'));
    assert.equal(namedState.officialStatusPayload?.recordId, namedState.platformPayload?.recordId, 'official status update must target the original platform record');
    assert.equal(namedState.officialStatusPayload?.status, 'email_verification_required', 'email verification stage should count as sent to MOENV');
    assert.match(namedState.platformPayload?.recordId || '', /^[A-Za-z0-9_-]{16,80}$/);
  }
  assert.match(await named.page.locator('#message').innerText(), /收件匣.*垃圾郵件.*完成認證/s);
  assert.match(await named.page.locator('#officialCaptchaStatus').innerText(), /尚未完成報案.*收件匣.*垃圾郵件.*案件編號/s);
  if (proofDir) await named.page.locator('#officialCaptchaPanel').screenshot({ path: path.join(proofDir, 'mobile-email-verification.png') });
  assert.equal(await named.page.locator('#officialReviewPanel').isVisible(), false, 'successful relay should not expose the manual fallback');
  assert.equal(await named.page.locator('#smellTime').isDisabled(), true, 'system-recorded smell time should not be editable');
  assert.equal(JSON.stringify(namedState.platformPayload).includes('0900000000'), false);
  assert.equal(JSON.stringify(namedState.platformPayload).includes('integration@example.com'), false);
  assert.equal(JSON.stringify(namedState.platformPayload).includes('dataBase64'), false);
  await named.context.close();

  const readyState = { baseUrl, platformPayload: null, preparePayload: null, finalizePayload: null, finalizeCalls: 0, prepareReady: true };
  const ready = await openIndex(browser, readyState);
  await ready.page.locator('#reporterName').fill('integration-test');
  await ready.page.locator('#reporterPhone').fill('0900000000');
  await ready.page.locator('#reporterEmail').fill('integration@example.com');
  await ready.page.locator('#reporterAddress').fill('雲林縣斗六市科福一街156號');
  await ready.page.locator('#officialSubmissionConfirmed').check();
  await ready.page.locator('#submitButton').click();
  await ready.page.waitForFunction(() => !document.querySelector('#officialCaptchaPanel')?.hidden);
  assert.equal(await ready.page.locator('#officialCaptchaImageWrap').isVisible(), false, 'empty CAPTCHA image must stay hidden before the official page exposes it');
  assert.equal(await ready.page.locator('#officialCaptchaField').isVisible(), false, 'CAPTCHA input must stay hidden before the official page exposes it');
  assert.equal(await ready.page.locator('#official-captcha-title').innerText(), '下一步：取得環境部驗證碼');
  assert.match(await ready.page.locator('#officialCaptchaInstructions').innerText(), /尚未送出|只會前往驗證碼頁/);
  assert.equal(await ready.page.locator('#officialCaptchaSubmit').innerText(), '取得環境部驗證碼');
  await ready.page.locator('#officialCaptchaSubmit').click();
  await ready.page.waitForFunction(() => document.querySelector('#officialCaptchaStatus')?.textContent?.includes('已取得環境部驗證碼'));
  assert.equal(await ready.page.locator('#officialCaptchaImageWrap').isVisible(), true, 'CAPTCHA image should appear when the official page reaches verification');
  assert.equal(await ready.page.locator('#officialCaptchaField').isVisible(), true, 'CAPTCHA input should appear when the official page reaches verification');
  assert.equal(await ready.page.locator('#officialCaptchaSubmit').innerText(), '輸入驗證碼並正式送出環境部陳情');
  await ready.context.close();

  const platformOnlyState = { baseUrl, platformPayload: null, preparePayload: null, finalizePayload: null };
  const platformOnly = await openIndex(browser, platformOnlyState);
  await platformOnly.page.locator('#reporterName').fill('partial-reporter');
  assert.equal(await platformOnly.page.locator('#submitButton').innerText(), '送出平台紀錄');
  assert.equal(await platformOnly.page.locator('#submitButton').isDisabled(), false);
  await platformOnly.page.locator('#submitButton').click();
  await platformOnly.page.waitForTimeout(700);
  assert.equal(platformOnlyState.platformPayload?.reporter, undefined);
  assert.equal(platformOnlyState.preparePayload, null);
  assert.equal(platformOnlyState.finalizePayload, null);
  assert.match(await platformOnly.page.locator('#message').innerText(), /只送出平台紀錄/);
  await platformOnly.context.close();

  console.log('browser-integration: PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
