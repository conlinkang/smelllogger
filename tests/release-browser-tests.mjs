import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));

function run(script, extraEnv) {
  const result = spawnSync(process.execPath, [path.join(testsDir, script)], {
    cwd: path.resolve(testsDir, '..'),
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8'
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

run('browser-integration.mjs', { INDEX_PAGE: 'index.html' });
run('analysis-date-regression.mjs', { ANALYSIS_PAGE: 'analysis.html' });
console.log('release-browser-tests: PASS');
