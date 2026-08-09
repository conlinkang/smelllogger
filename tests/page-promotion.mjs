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

assert.equal(
  index.replace("window.location.href = 'analysis.html';", "window.location.href = 'analysis_test.html';"),
  indexTest,
  'production index should match the verified test page except for its production navigation target'
);
assert.equal(
  analysis.replace('href="index.html"', 'href="index_test.html"'),
  analysisTest,
  'production analysis should match the verified test page except for its production navigation target'
);

assert.match(index, /window\.location\.href = 'analysis\.html'/);
assert.doesNotMatch(index, /window\.location\.href = 'analysis_test\.html'/);
assert.match(analysis, /href="index\.html"/);
assert.doesNotMatch(analysis, /href="index_test\.html"/);

assert.match(indexOld, /window\.location\.href = 'analysis_old\.html'/);
assert.match(analysisOld, /href="index_old\.html"/);
assert.doesNotMatch(indexOld, /officialCaptchaPanel/);
assert.doesNotMatch(analysisOld, /dashboard-summary/);

console.log('page-promotion: PASS');
