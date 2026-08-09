import express from 'express';
import { chromium } from 'playwright';
import { SpeechClient } from '@google-cloud/speech';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const REQUIRED_COUNTY = process.env.REQUIRED_COUNTY || '雲林縣';
const OFFICIAL_URL = 'https://ww3.moenv.gov.tw/Public/Case_Add.aspx';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const VOICE_MODEL = process.env.VERTEX_MODEL || 'gemini-2.5-flash';

app.disable('x-powered-by');
app.use(express.json({ limit: MAX_BODY_BYTES }));

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
}

function configureCors(req, res) {
  const allowedOrigin = String(process.env.ALLOWED_ORIGIN || '').trim();
  const origin = String(req.get('origin') || '').trim();
  if (allowedOrigin && origin === allowedOrigin) {
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Runner-Token');
    res.set('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    return Boolean(allowedOrigin && origin === allowedOrigin);
  }
  return true;
}

app.use((req, res, next) => {
  noStore(res);
  if (!configureCors(req, res)) return res.sendStatus(403);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const rateBuckets = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = Number(process.env.RATE_LIMIT_PER_MINUTE || 10);
  const key = `${req.ip}|${req.path}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > maxRequests) {
    res.set('Retry-After', '60');
    return res.status(429).json({ status: 'rejected', code: 'RATE_LIMITED', message: '請稍後再試' });
  }
  return next();
}

app.use(['/submit', '/analyze-voice'], rateLimit);

function text(value, maxLength = 500) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function parseCounty(address) {
  const value = text(address);
  const match = value.match(/^(.{2,5}縣|.{2,5}市)/);
  return match ? match[1] : '';
}

function parseTown(address) {
  const value = text(address);
  const county = parseCounty(value);
  const remainder = county ? value.slice(county.length) : value;
  const match = remainder.match(/^(.{1,6}(?:市|鎮|鄉|區))/);
  return match ? match[1] : '';
}

function normalizePacket(body) {
  const complaint = body && body.complaint && typeof body.complaint === 'object' ? body.complaint : {};
  const officialForm = complaint.officialForm && typeof complaint.officialForm === 'object' ? complaint.officialForm : {};
  const reporter = body && body.reporter && typeof body.reporter === 'object' ? body.reporter : {};
  const normalizedReporter = {
    name: text(reporter.name, 80),
    phone: text(reporter.phone, 40),
    email: text(reporter.email, 160),
    address: text(reporter.address, 160),
    county: text(reporter.county || parseCounty(reporter.address), 20),
    town: text(reporter.town || parseTown(reporter.address), 40)
  };
  return {
    mode: text(body && body.mode, 20) || 'prepare',
    finalSubmit: body && body.finalSubmit === true,
    confirmationText: text(body && body.confirmationText, 80),
    officialSubmissionConfirmed: body && body.officialSubmissionConfirmed === true,
    reporter: normalizedReporter,
    complaint: {
      locationAddress: text(complaint.locationAddress, 160),
      description: text(complaint.description, 2000),
      moenvCause: text(complaint.moenvCause, 80),
      moenvCauseLabel: text(complaint.moenvCauseLabel, 80),
      officialForm: {
        pollutantName: text(officialForm.pollutantName || '不明', 120),
        pollutantPhone: text(officialForm.pollutantPhone, 40),
        pollutantResponsible: text(officialForm.pollutantResponsible, 80),
        inspectionTime: text(officialForm.inspectionTime || 'no', 10),
        replyMethod: text(officialForm.replyMethod || 'email', 20),
        joinInspection: text(officialForm.joinInspection || 'no', 10),
        pollutionCounty: text(officialForm.pollutionCounty || parseCounty(complaint.locationAddress), 20),
        pollutionTown: text(officialForm.pollutionTown, 40),
        pollutionAddressNote: text(officialForm.pollutionAddressNote || complaint.locationAddress, 30)
      }
    }
  };
}

function validatePacket(body) {
  const packet = normalizePacket(body);
  const requiredReporterValues = [
    packet.reporter.name,
    packet.reporter.phone,
    packet.reporter.email,
    packet.reporter.address
  ];
  const county = packet.complaint.officialForm.pollutionCounty;
  if (!['prepare', 'submit'].includes(packet.mode)) {
    return { ok: false, status: 400, code: 'INVALID_MODE', message: 'mode must be prepare or submit' };
  }
  if (!packet.officialSubmissionConfirmed) {
    return { ok: false, status: 400, code: 'CONFIRMATION_REQUIRED', message: 'Explicit official submission confirmation is required' };
  }
  if (requiredReporterValues.some(value => value === '')) {
    return { ok: false, status: 400, code: 'REPORTER_INCOMPLETE', message: '姓名、電話、電子信箱與聯絡地址為必填' };
  }
  if (!packet.reporter.county || !packet.reporter.town) {
    return { ok: false, status: 400, code: 'REPORTER_ADDRESS_UNPARSEABLE', message: 'Reporter address must include a county/city and town/district' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(packet.reporter.email)) {
    return { ok: false, status: 400, code: 'REPORTER_EMAIL_INVALID', message: 'A valid email is required' };
  }
  if (!packet.complaint.description) {
    return { ok: false, status: 400, code: 'DESCRIPTION_REQUIRED', message: 'Complaint description is required' };
  }
  if (county !== REQUIRED_COUNTY) {
    return { ok: false, status: 400, code: 'COUNTY_MISMATCH', message: `This runner only accepts ${REQUIRED_COUNTY} cases` };
  }
  if (!packet.complaint.officialForm.pollutionTown || !packet.complaint.officialForm.pollutionAddressNote) {
    return { ok: false, status: 400, code: 'LOCATION_INCOMPLETE', message: 'County, town, and address note are required' };
  }
  if (packet.mode === 'submit' && (!packet.finalSubmit || packet.confirmationText !== '我確認以本人資料正式陳情')) {
    return { ok: false, status: 400, code: 'FINAL_CONFIRMATION_REQUIRED', message: 'Final submission requires the explicit confirmation text' };
  }
  return { ok: true, packet };
}

function runnerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const VOICE_ENUMS = Object.freeze({
  odorType: ['chemical', 'sulfur', 'ammonia', 'sewage', 'burning', 'oil', 'livestock', 'other'],
  moenvCause: ['animal', 'biogas', 'strawBurning', 'incenseBurning', 'unknown', 'other', 'productionProcess', 'openBurning', 'fire', 'kitchenWaste', 'cookingSmoke', 'fertilizeCompost'],
  duration: ['lessThanFive', 'fiveToThirty', 'thirtyToTwoHours', 'moreThanTwoHours', 'recurring'],
  suspectedSource: ['factory', 'livestock', 'sewage', 'burning', 'restaurant', 'vehicle', 'unknown'],
  impact: ['none', 'headache', 'nausea', 'throat', 'eye', 'other']
});

let speechClient;
let genaiClient;

function getVoiceClients() {
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw runnerError('VOICE_NOT_CONFIGURED', 'GOOGLE_CLOUD_PROJECT is required for voice analysis');
  }
  speechClient ||= new SpeechClient();
  genaiClient ||= new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
  });
  return { speechClient, genaiClient };
}

function enumValue(value, values, fallback) {
  return values.includes(value) ? value : fallback;
}

function normalizeVoiceAnalysis(value) {
  const source = value && typeof value === 'object' ? value : {};
  const impacts = Array.isArray(source.impacts)
    ? source.impacts.filter(item => VOICE_ENUMS.impact.includes(item)).slice(0, 4)
    : [];
  const level = Number(source.odorLevel);
  const confidence = Number(source.confidence);
  return {
    odorLevel: Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3,
    odorType: enumValue(source.odorType, VOICE_ENUMS.odorType, 'other'),
    moenvCause: enumValue(source.moenvCause, VOICE_ENUMS.moenvCause, 'unknown'),
    duration: enumValue(source.duration, VOICE_ENUMS.duration, 'fiveToThirty'),
    suspectedSource: enumValue(source.suspectedSource, VOICE_ENUMS.suspectedSource, 'unknown'),
    impacts: impacts.length ? impacts : ['none'],
    detail: text(source.detail, 200),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    needsReview: source.needsReview !== false
  };
}

function normalizeAcousticFeatures(value) {
  if (!value || typeof value !== 'object') return null;
  const numberOrZero = (input, maximum) => {
    const number = Number(input);
    return Number.isFinite(number) ? Math.max(0, Math.min(maximum, number)) : 0;
  };
  const loudnessLevel = ['low', 'medium', 'high'].includes(value.loudnessLevel) ? value.loudnessLevel : '';
  const sampleCount = Math.floor(numberOrZero(value.sampleCount, 240));
  if (!sampleCount && !loudnessLevel) return null;
  return {
    avgRms: Number(numberOrZero(value.avgRms, 1).toFixed(4)),
    peakRms: Number(numberOrZero(value.peakRms, 1).toFixed(4)),
    avgPitchHz: Number(numberOrZero(value.avgPitchHz, 600).toFixed(1)),
    pitchRangeHz: Number(numberOrZero(value.pitchRangeHz, 600).toFixed(1)),
    loudnessLevel,
    sampleCount,
    pitchSampleCount: Math.floor(numberOrZero(value.pitchSampleCount, 240))
  };
}

async function transcribeAudio(audioBase64, mimeType) {
  const { speechClient } = getVoiceClients();
  const audio = Buffer.from(String(audioBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) {
    throw runnerError('AUDIO_SIZE_INVALID', 'Audio is empty or exceeds the size limit');
  }
  const encoding = String(mimeType || '').includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS';
  const [response] = await speechClient.recognize({
    config: {
      encoding,
      sampleRateHertz: 48000,
      languageCode: 'zh-TW',
      maxAlternatives: 1,
      enableAutomaticPunctuation: true,
      model: process.env.SPEECH_MODEL || 'default'
    },
    audio: { content: audio.toString('base64') }
  });
  const alternatives = (response.results || []).map(result => result.alternatives?.[0]).filter(Boolean);
  return {
    transcript: alternatives.map(item => item.transcript || '').join('').trim(),
    confidence: alternatives.length ? Number(alternatives[0].confidence || 0) : 0
  };
}

async function classifyTranscript(transcript, acousticFeatures) {
  const { genaiClient } = getVoiceClients();
  const enumSchema = values => ({ type: Type.STRING, enum: values });
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      odorLevel: { type: Type.INTEGER },
      odorType: enumSchema(VOICE_ENUMS.odorType),
      moenvCause: enumSchema(VOICE_ENUMS.moenvCause),
      duration: enumSchema(VOICE_ENUMS.duration),
      suspectedSource: enumSchema(VOICE_ENUMS.suspectedSource),
      impacts: { type: Type.ARRAY, items: enumSchema(VOICE_ENUMS.impact) },
      detail: { type: Type.STRING },
      confidence: { type: Type.NUMBER },
      needsReview: { type: Type.BOOLEAN }
    },
    required: ['odorLevel', 'odorType', 'moenvCause', 'duration', 'suspectedSource', 'impacts', 'detail', 'confidence', 'needsReview']
  };
  const acousticHint = acousticFeatures
    ? `\n\n聲音表達特徵（弱輔助訊號，不代表生氣、人格或臭味強度；不可單獨用來決定臭味等級）：${JSON.stringify(acousticFeatures)}`
    : '';
  const prompt = `你是空氣污染臭味紀錄的分類輔助器。只能根據使用者逐字稿做候選分類，不可猜測姓名、電話、地址、污染者身分或法律責任。若資訊不清楚，選 unknown/other、臭味程度 3，並把 needsReview 設為 true。臭味程度是 1 到 5 的主觀感受，不是環境法規判定。音量、音調、音高變化可能受麥克風距離、個人習慣與環境影響，不能直接視為生氣或臭味強度；只有逐字稿沒有明確程度時，才可把聲音特徵當作很弱的候選提示，而且 needsReview 必須為 true。只回傳符合 schema 的 JSON，不要附加說明。\n\n既有選項：\n${JSON.stringify(VOICE_ENUMS)}\n\n使用者逐字稿：${transcript}${acousticHint}`;
  const response = await genaiClient.models.generateContent({
    model: VOICE_MODEL,
    contents: prompt,
    config: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema
    }
  });
  let parsed;
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch (error) {
    throw runnerError('VOICE_SCHEMA_INVALID', 'Vertex AI did not return valid JSON');
  }
  const normalized = normalizeVoiceAnalysis(parsed);
  if (acousticFeatures && acousticFeatures.sampleCount > 0) normalized.needsReview = true;
  return normalized;
}

async function count(page, selector) {
  return page.locator(selector).count();
}

async function fillFirst(page, selectors, value, required = false) {
  const cleanValue = text(value, 2000);
  if (!cleanValue) {
    if (required) throw runnerError('REQUIRED_VALUE_EMPTY', `Missing value for ${selectors[0]}`);
    return false;
  }
  for (const selector of selectors) {
    if (await count(page, selector) > 0) {
      await page.locator(selector).first().fill(cleanValue);
      return true;
    }
  }
  if (required) throw runnerError('OFFICIAL_SELECTOR_CHANGED', `Cannot find official field ${selectors[0]}`);
  return false;
}

async function clickFirst(page, selectors, required = false) {
  for (const selector of selectors) {
    if (await count(page, selector) > 0) {
      await page.locator(selector).first().click();
      return true;
    }
  }
  if (required) throw runnerError('OFFICIAL_SELECTOR_CHANGED', `Cannot find official control ${selectors[0]}`);
  return false;
}

async function selectFirst(page, selectors, label, required = false) {
  for (const selector of selectors) {
    if (await count(page, selector) > 0) {
      const locator = page.locator(selector).first();
      let lastError;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await locator.selectOption({ label });
          return true;
        } catch (error) {
          lastError = error;
          await page.waitForTimeout(350);
        }
      }
      if (lastError && required) throw lastError;
    }
  }
  if (required) throw runnerError('OFFICIAL_SELECTOR_CHANGED', `Cannot find official select ${selectors[0]}`);
  return false;
}

async function clickExactText(page, label, required = false) {
  const locator = page.getByText(label, { exact: true }).first();
  if (await locator.count() > 0) {
    await locator.click();
    return true;
  }
  if (required) throw runnerError('OFFICIAL_OPTION_CHANGED', `Cannot find official option ${label}`);
  return false;
}

const OFFICIAL_CAUSE_VALUES = Object.freeze({
  '沼氣（瓦斯）': '沼氣(瓦斯)',
  '燃燒行為－燒香或紙錢': '燃燒行為_燒香或紙錢'
});

async function clickOfficialCause(page, label) {
  const officialValue = OFFICIAL_CAUSE_VALUES[label] || label;
  await clickFirst(page, [`input[name="pollDetailBtn"][value="${officialValue}"]`], true);
}

async function pageHasCaptcha(page) {
  const body = (await page.locator('body').innerText()).toLowerCase();
  return /captcha|recaptcha|驗證碼|圖形驗證/.test(body);
}

async function fillOfficialForm(packet) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'zh-TW' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  let stage = 'open';
  try {
    await page.goto(OFFICIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    stage = 'consent';
    await clickFirst(page, ['input[value="我知道了"]']);
    if (await count(page, '#ckbAgree') > 0) {
      const consent = page.locator('#ckbAgree');
      if (!(await consent.isChecked())) await clickFirst(page, ['label[for="ckbAgree"]'], true);
      await clickFirst(page, ['input[name="ImageButton1"]'], true);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    } else {
      await clickFirst(page, ['#Btn_Agree', '#Btn_Start', 'input[value*="同意"]']);
    }
    stage = 'pollution-category';
    await clickExactText(page, packet.complaint.officialForm.pollutantName === '不明' ? '異味污染物' : packet.complaint.officialForm.pollutantName);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);
    stage = 'pollution-cause';
    await clickOfficialCause(page, packet.complaint.moenvCauseLabel || '施肥或堆肥');
    stage = 'pollution-description';
    await fillFirst(page, ['#TBox_Describe', '#TBox_Description', '#TBox_Content', 'textarea[name*="Describe"]'], packet.complaint.description, true);
    stage = 'pollution-description-next';
    await clickFirst(page, ['#Btn_Step1_next', '#Btn_Step2_next', 'input[value*="下一步"]'], true);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);

    stage = 'pollutant-details';
    await fillFirst(page, ['#TBox_PollName', '#TBox_PollutantName'], packet.complaint.officialForm.pollutantName, true);
    await fillFirst(page, ['#TBox_PollTel', '#TBox_PollutantTel'], packet.complaint.officialForm.pollutantPhone);
    await fillFirst(page, ['#TBox_PollPerson', '#TBox_PollutantPerson'], packet.complaint.officialForm.pollutantResponsible);
    await clickFirst(page, packet.complaint.officialForm.inspectionTime === 'yes' ? ['#rbtn_SpecifiedTime1'] : ['#rbtn_SpecifiedTime2'], true);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    stage = 'pollution-location-city';
    await selectFirst(page, ['#DDL_PollCity'], packet.complaint.officialForm.pollutionCounty, true);
    stage = 'pollution-location-town';
    await selectFirst(page, ['#DDL_PollTown'], packet.complaint.officialForm.pollutionTown, true);
    stage = 'pollution-location-mode';
    await clickFirst(page, ['#rb_Poll_addressMemo'], true);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(350);
    stage = 'pollution-location-note';
    await fillFirst(page, ['#Poll_address_detail'], packet.complaint.officialForm.pollutionAddressNote, true);
    stage = 'pollution-location-next';
    await clickFirst(page, ['#Btn_Step2_next', '#Btn_Step3_next', 'input[value*="下一步"]'], true);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);

    stage = 'reporter-contact';
    stage = 'reporter-reply-way';
    await selectFirst(page, ['#DDL_ReplyWay', 'select[name*="ReplyWay"]'], packet.complaint.officialForm.replyMethod === 'email' ? 'Email回覆' : packet.complaint.officialForm.replyMethod === 'phone' ? '電話回覆' : '書面回覆', true);
    stage = 'reporter-name';
    await fillFirst(page, ['#TBox_Name', 'input[name*="Name"]'], packet.reporter.name, true);
    stage = 'reporter-landline';
    await fillFirst(page, ['#TBox_Tel', 'input[name*="Tel"]'], packet.reporter.phone);
    stage = 'reporter-mobile';
    await fillFirst(page, ['#TBox_MBTel', 'input[name*="MBTel"]'], packet.reporter.phone);
    stage = 'reporter-email';
    await fillFirst(page, ['#TBox_Mail', 'input[type="email"]', 'input[name*="Mail"]'], packet.reporter.email, true);
    stage = 'reporter-city';
    await selectFirst(page, ['#DDL_City', 'select[name*="City"]'], packet.reporter.county, true);
    stage = 'reporter-town';
    await selectFirst(page, ['#DDL_Town', 'select[name*="Town"]'], packet.reporter.town, true);
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(500);
    stage = 'reporter-address';
    await fillFirst(page, ['#TBox_Address', 'input[name*="Address"]'], packet.reporter.address, true);
    if (packet.complaint.officialForm.joinInspection === 'no') {
      stage = 'reporter-join-inspection';
      await clickFirst(page, ['label[for="RBL_Worker2"]', '#RBL_Worker2', 'input[value*="否"]']);
    }
    stage = 'captcha-check';
    if (await pageHasCaptcha(page)) {
      return { status: 'manual_required', code: 'CAPTCHA_OR_HUMAN_CHECK', pageUrl: page.url() };
    }
    if (packet.mode === 'prepare' || !process.env.OFFICIAL_SUBMIT_ENABLED) {
      return { status: 'manual_required', code: 'READY_FOR_FINAL_REVIEW', pageUrl: page.url() };
    }
    stage = 'final-submit';
    await clickFirst(page, ['#Btn_Step3_next', '#Btn_Submit', 'input[type="submit"]'], true);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    const resultText = await page.locator('body').innerText();
    if (/受理編號|案件編號|送出成功|陳情完成/.test(resultText)) {
      return { status: 'submitted', pageUrl: page.url() };
    }
    return { status: 'manual_required', code: 'SUBMISSION_RESULT_UNCONFIRMED', pageUrl: page.url() };
  } catch (error) {
    error.stage = stage;
    throw error;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

const healthHandler = (req, res) => {
  res.json({
    ok: true,
    service: 'smelllogger-official-form-runner',
    county: REQUIRED_COUNTY,
    defaultMode: 'prepare',
    voiceConfigured: Boolean(process.env.GOOGLE_CLOUD_PROJECT)
  });
};

// Cloud Run's Google Frontend reserves /healthz on public run.app URLs.
// Keep it for local compatibility and expose /health as the public probe.
app.get(['/health', '/healthz'], healthHandler);

app.post('/analyze-voice', async (req, res) => {
  const expectedToken = String(process.env.RUNNER_TOKEN || '');
  if (expectedToken && req.get('x-runner-token') !== expectedToken) {
    return res.status(401).json({ status: 'rejected', code: 'UNAUTHORIZED', message: 'Runner token is required' });
  }
  const audioBase64 = req.body && req.body.audioBase64;
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    return res.status(400).json({ status: 'rejected', code: 'AUDIO_REQUIRED', message: 'Audio is required' });
  }
  try {
    const acousticFeatures = normalizeAcousticFeatures(req.body.acousticFeatures);
    const transcription = await transcribeAudio(audioBase64, req.body.mimeType);
    if (!transcription.transcript) {
      return res.status(422).json({ status: 'manual_required', code: 'NO_TRANSCRIPT', message: 'No speech was recognized' });
    }
    const analysis = await classifyTranscript(transcription.transcript, acousticFeatures);
    return res.json({ status: 'ok', transcript: transcription.transcript, transcriptConfidence: transcription.confidence, acousticFeatures, analysis });
  } catch (error) {
    const code = error.code || 'VOICE_ANALYSIS_FAILED';
    const status = code === 'VOICE_NOT_CONFIGURED' ? 503 : code === 'AUDIO_SIZE_INVALID' ? 413 : 502;
    return res.status(status).json({ status: 'manual_required', code, message: '語音分析暫時無法使用，請改用快速選項' });
  }
});

app.post('/submit', async (req, res) => {
  const expectedToken = String(process.env.RUNNER_TOKEN || '');
  if (expectedToken && req.get('x-runner-token') !== expectedToken) {
    return res.status(401).json({ status: 'rejected', code: 'UNAUTHORIZED', message: 'Runner token is required' });
  }
  const validation = validatePacket(req.body);
  if (!validation.ok) return res.status(validation.status).json({ status: 'rejected', code: validation.code, message: validation.message });
  try {
    const result = await fillOfficialForm(validation.packet);
    return res.status(result.status === 'submitted' ? 200 : 202).json(result);
  } catch (error) {
    const code = error.code || 'RUNNER_FAILED';
    const result = {
      status: 'manual_required',
      code,
      stage: error.stage || 'unknown',
      message: 'Official page changed or could not be completed; manual review is required'
    };
    if (process.env.DEBUG_RUNNER === 'true') result.detail = text(error.message, 300);
    return res.status(code === 'OFFICIAL_SELECTOR_CHANGED' || code === 'OFFICIAL_OPTION_CHANGED' ? 422 : 500).json(result);
  }
});

if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => console.log(`Official form runner listening on ${PORT}`));

export { app, normalizePacket, validatePacket, normalizeVoiceAnalysis, normalizeAcousticFeatures };
