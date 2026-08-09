import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { normalizeVoiceAnalysis, normalizeAcousticFeatures, validatePacket, validateCaptchaFinalize, isOfficialSubmitEnabled } = await import('../official-form-runner/server.js');

assert.equal(isOfficialSubmitEnabled('false'), false);
assert.equal(isOfficialSubmitEnabled('FALSE'), false);
assert.equal(isOfficialSubmitEnabled('true'), true);
assert.equal(isOfficialSubmitEnabled('  true '), true);

const packet = {
  mode: 'prepare',
  officialSubmissionConfirmed: true,
  reporter: {
    name: '自動化測試',
    phone: '0900000000',
    email: 'test@example.com',
    address: '雲林縣斗六市測試路156號'
  },
  complaint: {
    description: '雲林縣斗六市附近聞到畜牧或堆肥異味。',
    officialForm: {
      pollutantName: '不明',
      pollutionCounty: '雲林縣',
      pollutionTown: '斗六市',
      pollutionAddressNote: '雲林縣斗六市測試路156號附近',
      replyMethod: 'email',
      inspectionTime: 'no',
      joinInspection: 'no'
    }
  }
};

assert.equal(validatePacket(packet).ok, true);
assert.equal(validatePacket({ ...packet, reporter: { ...packet.reporter, email: '' } }).code, 'REPORTER_INCOMPLETE');
assert.equal(validatePacket({ ...packet, reporter: { ...packet.reporter, address: '科福一街156號' } }).code, 'REPORTER_ADDRESS_UNPARSEABLE');
assert.equal(validatePacket({ ...packet, complaint: { ...packet.complaint, officialForm: { ...packet.complaint.officialForm, pollutionCounty: '嘉義縣' } } }).code, 'COUNTY_MISMATCH');
assert.equal(validatePacket({ ...packet, mode: 'submit', finalSubmit: true }).code, 'FINAL_CONFIRMATION_REQUIRED');
assert.equal(validatePacket({ ...packet, mode: 'submit', finalSubmit: true, confirmationText: '我確認以本人資料正式陳情' }).ok, true);

const captchaFinalize = {
  sessionId: 'integration_session_abcdefghijklmnopqrstuvwxyz123456',
  captchaText: '9N9PF',
  confirmationText: '我確認以本人資料正式陳情'
};
assert.equal(validateCaptchaFinalize(captchaFinalize).ok, true);
assert.equal(validateCaptchaFinalize({ ...captchaFinalize, sessionId: 'short' }).code, 'SESSION_ID_INVALID');
assert.equal(validateCaptchaFinalize({ ...captchaFinalize, captchaText: '9N-9PF!' }).code, 'CAPTCHA_FORMAT_INVALID');
assert.equal(validateCaptchaFinalize({ ...captchaFinalize, confirmationText: '' }).code, 'FINAL_CONFIRMATION_REQUIRED');

const normalized = normalizeVoiceAnalysis({
  odorLevel: 7,
  odorType: 'not-an-option',
  moenvCause: 'fertilizeCompost',
  duration: 'fiveToThirty',
  suspectedSource: 'livestock',
  impacts: ['throat', 'bad-value'],
  confidence: 2,
  detail: '持續半小時',
  needsReview: false
});
assert.equal(normalized.odorLevel, 3);
assert.equal(normalized.odorType, 'other');
assert.deepEqual(normalized.impacts, ['throat']);
assert.equal(normalized.confidence, 1);
assert.equal(normalized.needsReview, false);

const acoustic = normalizeAcousticFeatures({
  avgRms: 0.32,
  peakRms: 1.4,
  avgPitchHz: 180,
  pitchRangeHz: 90,
  loudnessLevel: 'high',
  sampleCount: 12,
  pitchSampleCount: 8
});
assert.equal(acoustic.avgRms, 0.32);
assert.equal(acoustic.peakRms, 1);
assert.equal(acoustic.loudnessLevel, 'high');
assert.equal(normalizeAcousticFeatures({ loudnessLevel: 'invalid', sampleCount: 0 }), null);

console.log('runner-tests: PASS');
