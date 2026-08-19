import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');

const index = read('index.html');
const indexTest = read('index_test.html');
const analysis = read('analysis.html');
const analysisTest = read('analysis_test.html');
const indexOld = read('index_old.html');
const analysisOld = read('analysis_old.html');
const versionConfig = JSON.parse(read('assets/app-version.json'));

assert.match(indexTest, /currentRecordId = createRecordId\(\)/, 'test index should assign a record ID before platform submission');
assert.match(indexTest, /recordOfficialSubmissionOutcome\(result\.status\)/, 'test index should write back successful official submission status');
assert.doesNotMatch(index, /currentRecordId = createRecordId\(\)/, 'production index must remain unchanged during test-first development');
assert.match(analysisTest, /id="officialSubmissionCount"/, 'test analysis should show the official submission count');
assert.doesNotMatch(analysis, /id="officialSubmissionCount"/, 'production analysis must remain unchanged during test-first development');

assert.match(index, /window\.location\.href = 'analysis\.html'/);
assert.doesNotMatch(index, /window\.location\.href = 'analysis_test\.html'/);
assert.match(analysis, /href="index\.html"/);
assert.doesNotMatch(analysis, /href="index_test\.html"/);

assert.match(indexOld, /window\.location\.href = 'analysis_old\.html'/);
assert.match(analysisOld, /href="index_old\.html"/);
assert.doesNotMatch(indexOld, /officialCaptchaPanel/);
assert.doesNotMatch(analysisOld, /dashboard-summary/);

assert.match(versionConfig.version, /^\d{4}\.\d{2}\.\d{2}\.\d+$/);
for (const [name, page] of Object.entries({ index, indexTest, analysis, analysisTest })) {
  assert.match(page, /Cache-Control" content="no-cache, no-store, must-revalidate"/, `${name} should discourage stale browser caches`);
  assert.match(page, /assets\/app-version\.json/, `${name} should check the published application version`);
  assert.match(page, /fetch\(versionUrl, \{ cache: 'no-store' \}\)/, `${name} should bypass the version-file cache`);
  assert.match(page, /window\.location\.replace\(currentUrl\.toString\(\)\)/, `${name} should reload when a newer version is published`);
}

console.log('page-promotion: PASS');
