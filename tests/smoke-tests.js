import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function runScript(file, sandbox) {
  vm.createContext(sandbox);
  vm.runInContext(read(file), sandbox, { filename: file });
  return sandbox;
}

const dateSandbox = { window: {}, Intl, Date, console };
runScript('assets/js/date-utils.js', dateSandbox);
assert.equal(dateSandbox.window.APP_DATE.dateKey('2026-08-09T16:00:00Z'), '2026-08-10');
assert.equal(dateSandbox.window.APP_DATE.monthKey('2026-08-09T16:00:00Z'), '2026-08');
assert.match(dateSandbox.window.APP_DATE.nowInputValue(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const elements = {
  smellTime: { value: '2026-08-09T14:30' },
  odorType: { value: 'burning' },
  moenvCause: { value: 'fertilizeCompost' },
  odorDuration: { value: 'fiveToThirty' },
  suspectedSource: { value: 'unknown' },
  odorDetail: { value: '每天傍晚、從東南方飄來' },
  address: { textContent: '地址: 雲林縣斗六市測試路' },
  reportDescription: { value: '', dataset: {} },
  reporterName: { value: '王小明' },
  reporterPhone: { value: '0912345678' },
  reporterEmail: { value: 'user@example.com' },
  reporterAddress: { value: '雲林縣斗六市' },
  reporterConsent: { checked: true },
  officialSubmissionConfirmed: { checked: true }
};
const smellLevel = { value: '4', checked: true };
const impacts = [{ value: 'throat', checked: true }, { value: 'none', checked: false }];
const reportDocument = {
  getElementById: id => elements[id],
  querySelector: query => query.includes('smellLevel') ? smellLevel : null,
  querySelectorAll: query => query.includes('odorImpact') ? impacts : []
};
const reportSandbox = {
  document: reportDocument,
  window: {
    APP_CONFIG: {
      officialSubmissionMode: 'prepare',
      officialFinalConfirmationText: '我確認以本人資料正式陳情'
    },
    addEventListener: () => {},
    readWeatherInfo: elementId => elementId === 'weatherInfo'
      ? { weather: '小雨', temperature: 29, windSpeed: 2.4, windDirection: 135, provider: 'OpenWeatherMap' }
      : { weather: '', temperature: null, windSpeed: null, windDirection: null, provider: '' }
  },
  navigator: {},
  console
};
runScript('assets/js/report-form.js', reportSandbox);
const description = reportSandbox.window.generateReportDescription();
const complaint = reportSandbox.window.getComplaintData();
const platformComplaint = reportSandbox.window.getPlatformComplaintData();
const officialPacket = reportSandbox.window.getOfficialSubmissionPacket();
const reportPacket = reportSandbox.window.getReportPacketText();
assert.match(description, /燃燒或塑膠焦味/);
assert.match(description, /臭味程度4級（很重且刺鼻）/);
assert.match(description, /我感覺喉嚨或呼吸道不適/);
assert.match(description, /施肥或堆肥/);
assert.match(description, /喉嚨或呼吸道不適/);
assert.match(description, /小雨/);
assert.match(description, /OpenWeatherMap/);
assert.match(description, /https:\/\/conlinkang\.github\.io\/smelllogger\/index\.html 輔助填單/);
assert.equal(complaint.pollutionCategory, '異味污染物');
assert.equal(complaint.moenvCause, 'fertilizeCompost');
assert.equal(complaint.moenvCauseLabel, '施肥或堆肥');
assert.equal(complaint.officialSubmissionConfirmed, true);
assert.equal(complaint.officialForm.pollutantName, '不明');
assert.equal(complaint.officialForm.replyMethod, 'email');
assert.equal(complaint.locationAddress, '雲林縣斗六市測試路');
assert.equal(complaint.reporterConsent, true);
assert.deepEqual(Array.from(complaint.impacts), ['throat']);
assert.equal(complaint.reporter.email, 'user@example.com');
assert.equal(platformComplaint.reporter, undefined);
assert.equal(platformComplaint.reporterConsent, undefined);
assert.equal(officialPacket.reporter.email, 'user@example.com');
assert.equal(officialPacket.complaint.officialForm.pollutantName, '不明');
assert.equal(officialPacket.mode, 'prepare');
assert.equal(officialPacket.finalSubmit, false);
assert.equal(officialPacket.confirmationText, '');
reportSandbox.window.APP_CONFIG.officialSubmissionMode = 'submit';
const finalPacket = reportSandbox.window.getOfficialSubmissionPacket();
assert.equal(finalPacket.mode, 'submit');
assert.equal(finalPacket.finalSubmit, true);
assert.equal(finalPacket.confirmationText, '我確認以本人資料正式陳情');
reportSandbox.window.APP_CONFIG.officialSubmissionMode = 'prepare';
assert.equal(reportSandbox.window.hasUnconsentedReporterData(complaint), false);
assert.equal(reportSandbox.window.hasUnconsentedReporterData({ ...complaint, reporterConsent: false }), false);
assert.match(reportPacket, /公害污染陳情資料/);
assert.match(reportPacket, /雲林縣斗六市測試路/);
assert.match(reportPacket, /發生地點氣象：小雨/);
assert.match(reportPacket, /環境部快速分類：施肥或堆肥/);
assert.match(reportPacket, /污染者名稱：不明/);

elements.reporterName.value = '';
elements.reporterPhone.value = '';
elements.reporterEmail.value = '';
elements.reporterAddress.value = '';
elements.reporterConsent.checked = false;
const defaultComplaint = reportSandbox.window.getComplaintData();
assert.equal(defaultComplaint.reporterSource, 'platform-only');
assert.equal(defaultComplaint.reporterConsent, false);
assert.equal(defaultComplaint.reporter.name, '');
assert.equal(defaultComplaint.reporter.phone, '');
assert.equal(defaultComplaint.reporter.email, '');
assert.equal(defaultComplaint.reporter.address, '');
assert.equal(reportSandbox.window.hasUnconsentedReporterData(defaultComplaint), false);
assert.equal(reportSandbox.window.hasUnconsentedReporterData({ ...defaultComplaint, reporter: { name: '只有姓名', phone: '', email: '', address: '' } }), true);

const weatherRequests = [];
const weatherSandbox = {
  window: {
    APP_CONFIG: {
      weatherProvider: 'openweathermap',
      weatherApiKey: 'test-weather-key',
      weatherEndpoint: 'https://api.openweathermap.org/data/2.5/weather',
      weatherFallbackEndpoint: 'https://api.open-meteo.com/v1/forecast'
    }
  },
  URLSearchParams,
  fetch: async url => {
    weatherRequests.push(url);
    return {
      ok: true,
      json: async () => ({
        weather: [{ description: '晴' }],
        main: { temp: 31.5 },
        wind: { speed: 1.8, deg: 180 }
      })
    };
  },
  console
};
runScript('assets/js/weather-client.js', weatherSandbox);
const weatherResult = await weatherSandbox.window.fetchCurrentWeather(23.7, 120.5);
assert.equal(weatherResult.provider, 'OpenWeatherMap');
assert.equal(weatherResult.temperature, 31.5);
assert.equal(weatherResult.windDirection, 180);
assert.match(weatherRequests[0], /appid=test-weather-key/);

const summaryElements = {
  recordCount: { textContent: '' },
  averageLevel: { textContent: '' },
  peakLevel: { textContent: '' },
  peakTime: { textContent: '' },
  summaryText: { textContent: '' },
  trendChart: {
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); }
  }
};
const summaryDocument = {
  getElementById: id => summaryElements[id],
  createElement: () => ({ className: '', textContent: '' }),
  createElementNS: () => ({ setAttribute() {}, appendChild() {} })
};
const summarySandbox = {
  document: summaryDocument,
  window: { APP_DATE: { hourKey: value => value.slice(0, 13) + ':00' } },
  console
};
runScript('assets/js/analysis-ui.js', summarySandbox);
summarySandbox.window.renderAnalysisSummary([
  { 聞到的時間: '2026-08-09T10:15:00+08:00', 臭味程度: 2 },
  { 聞到的時間: '2026-08-09T10:45:00+08:00', 臭味程度: 4 }
]);
assert.equal(summaryElements.recordCount.textContent, '2');
assert.equal(summaryElements.averageLevel.textContent, '3.0');
assert.equal(summaryElements.peakLevel.textContent, '4 級');
assert.ok(summaryElements.trendChart.children.length > 0);

const submissionSandbox = {
  window: { APP_CONFIG: { recordEndpoint: 'https://example.test/record', recordMode: 'no-cors', requestTimeoutMs: 1000 } },
  AbortController,
  setTimeout,
  clearTimeout,
  fetch: async () => ({ type: 'opaque', ok: false }),
  console
};
runScript('assets/js/submission-client.js', submissionSandbox);
const submissionResult = await submissionSandbox.window.submitRecord({ complaint: { description: 'test' } });
assert.equal(submissionResult.confirmed, false);
assert.equal(submissionResult.responseType, 'opaque');
const officialNotConfigured = await submissionSandbox.window.submitOfficialComplaint({ reporter: {} });
assert.equal(officialNotConfigured.status, 'not_configured');

const backendSandbox = { console };
runScript('apps-script/Code.gs', backendSandbox);
const backendPayload = {
  lat: 23.7,
  lng: 120.5,
  smellLevel: 4,
  smellTime: '2026-08-09T14:30',
  weatherInfo: { weather: '晴', temperature: 30, windSpeed: 1.2, windDirection: 180 },
  weatherInfo_suspect: {},
  complaint: {
    pollutionCategory: '異味污染物',
    locationAddress: '雲林縣斗六市測試路',
    moenvCause: 'fertilizeCompost',
    moenvCauseLabel: '施肥或堆肥',
    officialSubmissionConfirmed: true,
    odorType: 'burning',
    description: '測試說明',
    reporterConsent: true,
    reporter: { name: '個資', phone: '0900000000' }
  }
};
backendSandbox.validatePayload_(backendPayload);
const backendRecord = backendSandbox.buildRecord_(backendPayload, new Date('2026-08-09T06:30:00.000Z'));
assert.equal(backendRecord['臭味程度'], 4);
assert.doesNotMatch(backendRecord['通報資料JSON'], /個資|0900000000/);
const backendHeaders = Object.keys(backendRecord);
const backendPublic = backendSandbox.publicRecordFromRow_(backendHeaders, backendHeaders.map(header => backendRecord[header]));
assert.equal(backendPublic.complaint.odorType, 'burning');
assert.equal(backendPublic.complaint.locationCounty, '雲林縣');
assert.equal(backendPublic.complaint.locationTown, '斗六市');
assert.equal(backendPublic.complaint.moenvCause, 'fertilizeCompost');
assert.equal(backendPublic.complaint.officialSubmissionConfirmed, true);
assert.equal(backendPublic.reporter, undefined);
assert.equal(backendPublic['通報資料JSON'], undefined);
const noConsentPayload = { ...backendPayload, complaint: { ...backendPayload.complaint, reporterConsent: false } };
const noConsentRecord = backendSandbox.buildRecord_(noConsentPayload, new Date('2026-08-09T06:30:00.000Z'));
assert.doesNotMatch(noConsentRecord['通報資料JSON'], /個資/);
const blankReporterPayload = {
  ...backendPayload,
  complaint: {
    ...backendPayload.complaint,
    reporterConsent: false,
    reporter: { name: '', phone: '', email: '', address: '' }
  }
};
const platformOnlyRecord = backendSandbox.buildRecord_(blankReporterPayload, new Date('2026-08-09T06:30:00.000Z'));
assert.doesNotMatch(platformOnlyRecord['通報資料JSON'], /"reporter":|康嘉麟|0963158502|conlinkang@gmail\.com|科福一街156號/);
assert.match(platformOnlyRecord['通報資料JSON'], /platform-only/);

for (const file of ['index_test.html', 'analysis_test.html']) {
  const source = read(file);
  assert.doesNotMatch(source, /AIzaSy|b142fac|openweathermap|api\.ipify/);
  assert.doesNotMatch(source, /callback=initMap/);
  assert.doesNotMatch(source, /HeatmapLayer|google\.maps\.visualization/);
  assert.doesNotMatch(source, /0963158502|conlinkang@gmail\.com|科福一街156號/);
  assert.doesNotMatch(source, /window\.addEventListener\(['"]load['"]/);
}
for (const file of ['index_test.html']) {
  const source = read(file);
  for (const label of ['動物', '沼氣（瓦斯）', '燃燒稻草', '露天燃燒', '廚餘蒸煮異味', '施肥或堆肥']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /officialSubmissionConfirmed/);
}
for (const file of ['analysis_test.html']) {
  const source = read(file);
  assert.doesNotMatch(source, /filterRegion/);
  assert.match(source, /雲林縣/);
  assert.match(source, /const region = '雲林縣'/);
  assert.match(source, /recordMatchesRegion/);
}

for (const file of ['index_test.html']) {
  const source = read(file);
   assert.match(source, /康嘉麟教授\(中正大學化工系\)/);
  assert.match(source, /voiceStartButton/);
  assert.match(source, /voice-assist/);
  assert.match(source, /voice-badge/);
  assert.match(source, /voiceAcousticCue/);
   assert.match(source, /Google Cloud Speech-to-Text/);
}

const runnerSource = read('official-form-runner/server.js');
const configSource = read('assets/js/app-config.js');
const submissionSource = read('assets/js/submission-client.js');
assert.match(configSource, /officialSubmissionTimeoutMs: 60000/);
assert.match(submissionSource, /officialSubmissionTimeoutMs/);
assert.match(runnerSource, /REQUIRED_COUNTY = process\.env\.REQUIRED_COUNTY \|\| '雲林縣'/);
assert.match(runnerSource, /mode === 'prepare'/);
assert.match(runnerSource, /OFFICIAL_SUBMIT_ENABLED/);
assert.match(runnerSource, /manual_required/);
assert.match(runnerSource, /normalizeAcousticFeatures/);
assert.match(runnerSource, /SPEECH_MODEL/);
assert.doesNotMatch(runnerSource, /console\.log\(.*reporter|console\.log\(.*request|console\.log\(.*body/);

console.log('smoke-tests: PASS');
