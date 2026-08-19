/**
 * Smell Logger Google Apps Script backend.
 *
 * Deploy as a web app and point app-config.js at the deployment URL.
 * The sheet stores the complete complaint JSON, while doGet exposes only
 * public analysis fields and never returns reporter contact information.
 */

const CONFIG = Object.freeze({
  // For a bound script, leave this empty. For a standalone script, set the ID.
  spreadsheetId: '',
  sheetName: '工作表1'
});

const HEADERS = [
  '紀錄ID',
  '紀錄時間',
  '緯度',
  '經度',
  '臭味程度',
  '聞到的時間',
  '氣象狀態',
  '溫度',
  '風速',
  '風向',
  '嫌疑位置氣象狀態',
  '嫌疑位置溫度',
  '嫌疑位置風速',
  '嫌疑位置風向',
  'IP',
  '備註',
  '通報資料JSON',
  '環境部送出狀態',
  '環境部送出時間'
];

const PRIVATE_HEADERS = new Set(['紀錄ID', 'IP', '備註', '通報資料JSON']);
const OFFICIAL_SENT_STATUSES = new Set(['submitted', 'email_verification_required']);

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    if (payload.action === 'official-submission-status') {
      return jsonResponse_(updateOfficialSubmission_(payload, new Date()));
    }
    validatePayload_(payload);
    const sheet = getSheet_();
    const headers = ensureHeaders_(sheet);
    const record = buildRecord_(payload, new Date());
    const row = headers.map(header => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '');
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doGet() {
  try {
    const sheet = getSheet_();
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return jsonResponse_({ records: [] });

    const headers = values[0].map(String);
    const records = values.slice(1)
      .filter(row => row.some(value => value !== '' && value !== null))
      .map(row => publicRecordFromRow_(headers, row));
    return jsonResponse_({ records });
  } catch (error) {
    return jsonResponse_({ records: [], error: String(error && error.message ? error.message : error) });
  }
}

function parsePayload_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (typeof raw !== 'string' || raw.trim() === '') throw new Error('Missing request body');
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload must be an object');
  return payload;
}

function validatePayload_(payload) {
  if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lng))) {
    throw new Error('lat and lng are required numbers');
  }
  const level = Number(payload.smellLevel);
  if (!Number.isInteger(level) || level < 1 || level > 5) throw new Error('smellLevel must be 1-5');
  if (typeof payload.smellTime !== 'string' || payload.smellTime.trim() === '') throw new Error('smellTime is required');
  if (!payload.complaint || typeof payload.complaint !== 'object' || Array.isArray(payload.complaint)) {
    throw new Error('complaint is required');
  }
}

function buildRecord_(payload, recordedAt) {
  const weather = payload.weatherInfo || {};
  const suspectedWeather = payload.weatherInfo_suspect || {};
  const complaint = complaintForStorage_(payload.complaint || {});
  return {
    '紀錄ID': normaliseRecordId_(payload.recordId, false),
    '紀錄時間': recordedAt,
    '緯度': Number(payload.lat),
    '經度': Number(payload.lng),
    '臭味程度': Number(payload.smellLevel),
    '聞到的時間': payload.smellTime,
    '氣象狀態': valueOrBlank_(weather.weather),
    '溫度': valueOrBlank_(weather.temperature),
    '風速': valueOrBlank_(weather.windSpeed),
    '風向': valueOrBlank_(weather.windDirection),
    '嫌疑位置氣象狀態': valueOrBlank_(suspectedWeather.weather),
    '嫌疑位置溫度': valueOrBlank_(suspectedWeather.temperature),
    '嫌疑位置風速': valueOrBlank_(suspectedWeather.windSpeed),
    '嫌疑位置風向': valueOrBlank_(suspectedWeather.windDirection),
    // IP is intentionally not collected by the first-version frontend.
    'IP': '',
    // Keep a readable legacy note while the JSON column is the source of truth.
    '備註': valueOrBlank_(complaint.description),
    '通報資料JSON': JSON.stringify(complaint),
    '環境部送出狀態': '',
    '環境部送出時間': ''
  };
}

function updateOfficialSubmission_(payload, submittedAt) {
  const recordId = normaliseRecordId_(payload.recordId, true);
  const status = String(payload.status || '').trim();
  if (!OFFICIAL_SENT_STATUSES.has(status)) throw new Error('Unsupported official submission status');

  const sheet = getSheet_();
  const headers = ensureHeaders_(sheet);
  const idColumn = headers.indexOf('紀錄ID') + 1;
  const statusColumn = headers.indexOf('環境部送出狀態') + 1;
  const timeColumn = headers.indexOf('環境部送出時間') + 1;
  const rowCount = sheet.getLastRow() - 1;
  if (rowCount < 1) throw new Error('Record not found');

  const ids = sheet.getRange(2, idColumn, rowCount, 1).getValues();
  let rowNumber = 0;
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    if (String(ids[index][0] || '') === recordId) {
      rowNumber = index + 2;
      break;
    }
  }
  if (!rowNumber) throw new Error('Record not found');

  sheet.getRange(rowNumber, statusColumn).setValue(status);
  sheet.getRange(rowNumber, timeColumn).setValue(submittedAt);
  return { ok: true, updated: true, status };
}

function normaliseRecordId_(value, required) {
  const recordId = String(value || '').trim();
  if (!recordId && !required) return '';
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(recordId)) throw new Error('Invalid recordId');
  return recordId;
}

function complaintForStorage_(complaint) {
  const stored = JSON.parse(JSON.stringify(complaint || {}));
  const reporter = stored.reporter && typeof stored.reporter === 'object' ? stored.reporter : {};
  const hasReporterData = Object.values(reporter).some(value => String(value || '').trim() !== '');
  // Reporter contact data stays in the user's browser only. Never write it to Sheets.
  delete stored.reporter;
  delete stored.reporterConsent;
  stored.reporterSource = hasReporterData ? 'user-local-or-session' : 'platform-only';
  return stored;
}

function publicRecordFromRow_(headers, row) {
  const record = {};
  headers.forEach((header, index) => {
    if (!header || PRIVATE_HEADERS.has(header)) return;
    record[header] = serialiseValue_(row[index]);
  });

  const complaintIndex = headers.indexOf('通報資料JSON');
  if (complaintIndex >= 0 && row[complaintIndex]) {
    try {
      record.complaint = publicComplaint_(JSON.parse(String(row[complaintIndex])));
    } catch (error) {
      // Keep legacy rows readable even if their optional complaint JSON is invalid.
    }
  }
  return record;
}

function publicComplaint_(complaint) {
  const safe = complaint || {};
  const officialForm = safe.officialForm && typeof safe.officialForm === 'object' ? safe.officialForm : {};
  const addressParts = parseLocationParts_(safe.locationAddress);
  return {
    pollutionCategory: valueOrBlank_(safe.pollutionCategory),
    locationAddress: valueOrBlank_(safe.locationAddress),
    locationCounty: valueOrBlank_(officialForm.pollutionCounty || addressParts.county),
    locationTown: valueOrBlank_(officialForm.pollutionTown || addressParts.town),
    moenvCause: valueOrBlank_(safe.moenvCause),
    moenvCauseLabel: valueOrBlank_(safe.moenvCauseLabel),
    officialSubmissionConfirmed: safe.officialSubmissionConfirmed === true,
    odorType: valueOrBlank_(safe.odorType),
    odorTypeLabel: valueOrBlank_(safe.odorTypeLabel),
    duration: valueOrBlank_(safe.duration),
    durationLabel: valueOrBlank_(safe.durationLabel),
    suspectedSource: valueOrBlank_(safe.suspectedSource),
    suspectedSourceLabel: valueOrBlank_(safe.suspectedSourceLabel),
    impacts: Array.isArray(safe.impacts) ? safe.impacts : [],
    impactLabels: Array.isArray(safe.impactLabels) ? safe.impactLabels : []
  };
}

function parseLocationParts_(address) {
  const text = String(address || '').trim();
  const match = text.match(/^(.*?[縣市])\s*(.*?[市鎮鄉區])/);
  return {
    county: match ? match[1] : '',
    town: match ? match[2] : ''
  };
}

function valueOrBlank_(value) {
  return value === undefined || value === null ? '' : value;
}

function serialiseValue_(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function getSheet_() {
  const spreadsheet = CONFIG.spreadsheetId
    ? SpreadsheetApp.openById(CONFIG.spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Configure CONFIG.spreadsheetId for a standalone script');
  return spreadsheet.getSheetByName(CONFIG.sheetName) || spreadsheet.insertSheet(CONFIG.sheetName);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return HEADERS.slice();
  }

  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
  const missing = HEADERS.filter(header => headers.indexOf(header) < 0);
  if (missing.length > 0) {
    sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]);
    return headers.concat(missing);
  }
  return headers;
}

function jsonResponse_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
