import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../official-form-runner/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const analysisPage = process.env.ANALYSIS_PAGE || 'analysis_test.html';
const proofDir = process.env.PROOF_DIR ? path.resolve(process.env.PROOF_DIR) : '';
if (proofDir) fs.mkdirSync(proofDir, { recursive: true });
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8'
};

const field = {
  latitude: '\u7def\u5ea6',
  longitude: '\u7d93\u5ea6',
  time: '\u805e\u5230\u7684\u6642\u9593',
  level: '\u81ed\u5473\u7a0b\u5ea6',
  officialStatus: '\u74b0\u5883\u90e8\u9001\u51fa\u72c0\u614b'
};

const records = [
  { [field.latitude]: 23.713, [field.longitude]: 120.505, [field.time]: '2026-08-04T10:00:00+08:00', [field.level]: 4 },
  { [field.latitude]: 23.714, [field.longitude]: 120.506, [field.time]: '2026-08-02T10:00:00+08:00', [field.level]: 3 },
  { [field.latitude]: 23.715, [field.longitude]: 120.507, [field.time]: '2026-07-20T10:00:00+08:00', [field.level]: 2 },
  { [field.latitude]: 23.716, [field.longitude]: 120.508, [field.time]: '2026-07-19T10:00:00+08:00', [field.level]: 5 },
  { [field.latitude]: 23.717, [field.longitude]: 120.509, [field.time]: '2024-10-07T13:18:00+08:00', [field.level]: 5, [field.officialStatus]: 'email_verification_required' },
  { [field.latitude]: 23.718, [field.longitude]: 120.510, [field.time]: '2024-10-30T05:17:00+08:00', [field.level]: 4 }
];

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
    const relativePath = requestPath === '/' ? '/analysis_test.html' : requestPath;
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
    class MockMap {
      constructor(element) { this.element = element; element.dataset.mapReady = 'true'; }
      panTo() {}
    }
    class Circle {
      constructor(options) {
        this.options = options;
        if (options.fillColor === '#facc15') window.__yellowCircleCount = (window.__yellowCircleCount || 0) + 1;
      }
      setMap() {}
    }
    class LatLng { constructor(lat, lng) { this.lat = () => lat; this.lng = () => lng; } }
    class OverlayView {
      setMap() {}
      getPanes() { return { overlayLayer: document.createElement('div') }; }
      getProjection() { return { fromLatLngToDivPixel: () => ({ x: 0, y: 0 }) }; }
    }
    window.google = {
      maps: {
        Map: MockMap,
        Circle,
        LatLng,
        OverlayView,
        event: { addListener() {} }
      }
    };
    window.__smellLoggerMapsReady();
  })();`;
}

const server = await startStaticServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route('**/maps.googleapis.com/maps/api/js*', route => route.fulfill({
    status: 200,
    contentType: 'text/javascript',
    body: mapsStub()
  }));
  await page.route('**/script.google.com/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ records })
  }));

  await page.goto(`${baseUrl}/${analysisPage}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#recordCount')?.textContent !== '--');

  assert.equal(await page.locator('#filterRegion').count(), 0, 'analysis must not show a region selector');
  assert.equal(await page.locator('.controls > *').evaluateAll(elements => {
    const levelIndex = elements.findIndex(element => element.classList.contains('level-filter'));
    const returnIndex = elements.findIndex(element => element.querySelector?.('.return-button'));
    return returnIndex === levelIndex + 1;
  }), true, 'return button should appear immediately after the smell level filter');
  assert.equal(await page.locator('#filterDate').inputValue(), '2026-08-04', 'daily analysis should default to latest Yunlin record date');
  assert.equal(await page.locator('#recordCount').textContent(), '1', 'latest daily record should be displayed');

  await page.locator('#filterDate').fill('2026-08-02');
  await page.locator('#filterDate').dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#filterDate').inputValue(), '2026-08-02', 'selected daily date must remain selected after reload');
  assert.equal(await page.locator('#recordCount').textContent(), '1', 'selected daily record should be displayed');

  await page.locator('#analysisType').selectOption('month');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#filterDate').inputValue(), '2026-08', 'monthly analysis should default to latest Yunlin month');
  assert.equal(await page.locator('#recordCount').textContent(), '2', 'latest monthly records should be displayed');

  await page.locator('#filterDate').fill('2026-07');
  await page.locator('#filterDate').dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#filterDate').inputValue(), '2026-07', 'selected monthly date must remain selected after reload');
  assert.equal(await page.locator('#recordCount').textContent(), '2', 'selected monthly records should be displayed');

  await page.locator('#filterDate').fill('2024-10');
  await page.locator('#filterDate').dispatchEvent('change');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#filterDate').inputValue(), '2024-10', '2024-10 must be selectable in monthly analysis');
  assert.equal(await page.locator('#recordCount').textContent(), '2', '2024-10 monthly records should be displayed');
  if (analysisPage === 'analysis_test.html' || analysisPage === 'analysis.html') {
    assert.equal(await page.locator('#officialSubmissionCount').textContent(), '1', 'analysis should count records sent to MOENV within the active filters');
  }
  assert.equal(await page.locator('#trendChart svg').count(), 1, '2024-10 should render a trend chart');
  assert.equal(await page.locator('#trendChart').getAttribute('data-granularity'), 'day', 'monthly trend should aggregate by day');
  assert.match(await page.locator('#summaryText').innerText(), /每日平均/);
  const trendMetrics = await page.locator('#trendChart').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    chartHeight: element.querySelector('svg')?.getBoundingClientRect().height || 0
  }));
  assert.ok(trendMetrics.scrollWidth <= trendMetrics.clientWidth + 1, 'mobile trend chart should not require horizontal scrolling');
  assert.ok(trendMetrics.chartHeight <= 160, 'mobile trend chart should remain compact');
  if (proofDir) await page.locator('.dashboard-summary').screenshot({ path: path.join(proofDir, 'analysis-mobile-compact-trend.png') });

  await page.locator('#minSmellLevel').selectOption('5');
  await page.waitForFunction(() => document.querySelector('#recordCount')?.textContent === '1');
  assert.equal(await page.locator('#recordCount').textContent(), '1', 'level 5 filter should hide the level 4 record');
  if (analysisPage === 'analysis_test.html' || analysisPage === 'analysis.html') {
    assert.equal(await page.locator('#officialSubmissionCount').textContent(), '1', 'official submission count should follow the smell-level filter');
  }
  assert.equal(await page.locator('#minSmellLevelHint').innerText(), '選 5 = 僅顯示 5 級紀錄');
  await page.locator('#minSmellLevel').selectOption('1');
  await page.waitForFunction(() => document.querySelector('#recordCount')?.textContent === '2');
  assert.equal(await page.locator('#recordCount').textContent(), '2', 'level 1 filter should restore all monthly records');
  assert.equal(await page.locator('#minSmellLevelHint').innerText(), '選 1 = 顯示 1～5 級紀錄');

  const mobileLayout = await page.evaluate(() => {
    const controls = document.querySelector('.controls').getBoundingClientRect();
    const level = document.querySelector('.level-filter').getBoundingClientRect();
    const returnLink = document.querySelector('.controls > a').getBoundingClientRect();
    const legend = document.querySelector('#legend').getBoundingClientRect();
    return {
      levelMatchesControls: Math.abs(level.width - controls.width + 20) <= 2,
      returnMatchesControls: Math.abs(returnLink.width - controls.width + 20) <= 2,
      legendMatchesControls: Math.abs(legend.width - controls.width) <= 2
    };
  });
  assert.equal(mobileLayout.levelMatchesControls, true, 'mobile smell level filter should span the control card width');
  assert.equal(mobileLayout.returnMatchesControls, true, 'mobile return button should span the control card width');
  assert.equal(mobileLayout.legendMatchesControls, true, 'mobile legend should match the surrounding card width');
  if (proofDir) {
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.jQuery?.('#ui-datepicker-div').hide();
    });
    await page.locator('.controls').screenshot({ path: path.join(proofDir, 'analysis-mobile-controls.png') });
    await page.locator('#legend').screenshot({ path: path.join(proofDir, 'analysis-mobile-legend.png') });
  }

  const timeSlider = page.locator('#timeSlider');
  assert.equal(await timeSlider.count(), 1, 'compact time slider should be rendered');
  await timeSlider.evaluate((element) => {
    element.value = '0';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.equal(await page.locator('#timeSelectionCount').innerText(), '第 1 / 2 筆', 'selected time should show its position in the filtered records');
  assert.match(await page.locator('#timeDisplay').innerText(), /臭味程度/);
  assert.ok(await page.evaluate(() => window.__yellowCircleCount > 0), 'selected report should create a yellow map highlight');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.jQuery?.('#filterDate').datepicker('hide');
    window.jQuery?.('#ui-datepicker-div').hide();
  });
  const desktopLayout = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.controls > label')).map(element => element.getBoundingClientRect());
    const controls = document.querySelector('.controls').getBoundingClientRect();
    const legend = document.querySelector('#legend').getBoundingClientRect();
    const trend = document.querySelector('#trendChart').getBoundingClientRect();
    const firstSelect = document.querySelector('#analysisType').getBoundingClientRect();
    const returnButton = document.querySelector('.return-button').getBoundingClientRect();
    return {
      labelTopSpread: Math.max(...labels.map(rect => rect.top)) - Math.min(...labels.map(rect => rect.top)),
      labelsRemainInOneRow: labels.every(rect => rect.bottom <= controls.bottom),
      legendTrendWidthDifference: Math.abs(legend.width - trend.width),
      legendControlWidthDifference: Math.abs(legend.width - controls.width),
      returnTopDifference: Math.abs(returnButton.top - firstSelect.top),
      returnHeightDifference: Math.abs(returnButton.height - firstSelect.height)
    };
  });
  assert.ok(desktopLayout.labelTopSpread <= 1, 'desktop analysis labels should align on one horizontal top line');
  assert.equal(desktopLayout.labelsRemainInOneRow, true, 'desktop analysis controls should remain inside one row');
  assert.ok(desktopLayout.legendTrendWidthDifference <= 2, 'desktop legend should match the trend card width');
  assert.ok(desktopLayout.legendControlWidthDifference <= 2, 'desktop legend should match the controls width');
  assert.ok(desktopLayout.returnTopDifference <= 1, 'desktop return button should align horizontally with the filter controls');
  assert.ok(desktopLayout.returnHeightDifference <= 1, 'desktop return button should match the filter control height');
  if (proofDir) {
    await page.locator('.controls').screenshot({ path: path.join(proofDir, 'analysis-desktop-controls.png') });
    await page.locator('#legend').screenshot({ path: path.join(proofDir, 'analysis-desktop-legend.png') });
  }

  console.log('analysis-date-regression: PASS');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
