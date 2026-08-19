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

assert.equal(
  index.replace("window.location.href = 'analysis.html';", "window.location.href = 'analysis_test.html';"),
  indexTest,
  'production and test index pages may differ only in the analysis destination'
);
assert.equal(
  analysis.replace('href="index.html"', 'href="index_test.html"'),
  analysisTest,
  'production and test analysis pages may differ only in the return destination'
);
for (const [name, page] of Object.entries({ index, indexTest })) {
  assert.match(page, /currentRecordId = createRecordId\(\)/, `${name} should assign a record ID before platform submission`);
  assert.match(page, /recordOfficialSubmissionOutcome\(result\.status\)/, `${name} should write back successful official submission status`);
}
for (const [name, page] of Object.entries({ analysis, analysisTest })) {
  assert.match(page, /id="officialSubmissionCount"/, `${name} should show the official submission count`);
}

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
