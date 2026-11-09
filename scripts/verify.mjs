import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { mkdir, appendFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = new URL('../', import.meta.url);
process.chdir(fileURLToPath(root));
const evidence = 'artifacts/map-exploration';
await mkdir(evidence, { recursive: true });
let writes = Promise.resolve();
const save = (path, data) => { writes = writes.then(() => appendFile(path, data)); return writes; };
const log = async message => { console.log(message); await save(`${evidence}/verify.log`, `${new Date().toISOString()} ${message}\n`); };
async function doctor() {
  const response = await fetch('http://127.0.0.1:4173/', { signal: AbortSignal.timeout(2000) });
  if (!response.ok || !(await response.text()).includes('地図の行間')) throw new Error('Doctor: app HTTP check failed');
  const data = await fetch('http://127.0.0.1:4173/data/countries.json', { signal: AbortSignal.timeout(2000) });
  if (!data.ok) throw new Error('Doctor: geographic HTTP check failed');
  const json = await data.json();
  if (json.type !== 'FeatureCollection' || json.features?.length !== 14) throw new Error('Doctor: geographic data not ready');
  await log('Doctor: HTTP 200 on port 4173; app and 14-country JSON ready. Read-only check.');
}
if (process.argv.includes('--doctor')) { await doctor(); process.exit(0); }
await access('dist/index.html');
const occupied = await new Promise(resolve => {
  const socket = createConnection({ host: '127.0.0.1', port: 4173 });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
if (occupied) throw new Error('Port 4173 already occupied; no server was started or stopped.');
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' },
});
let launchOutput = '';
child.stdout.on('data', data => { launchOutput += String(data); void save(`${evidence}/preview.log`, data); });
child.stderr.on('data', data => { void save(`${evidence}/preview.log`, data); });
let stopped = false;
let drive;
async function cleanup() {
  if (stopped) return; stopped = true;
  if (drive && drive.exitCode === null && drive.signalCode === null) drive.kill('SIGTERM');
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await log(`Cleanup: stopped only owned preview PID ${child.pid}; evidence retained.`);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await cleanup(); process.exit(130); });
try {
  await writeFile(`${evidence}/server.json`, JSON.stringify({ pid: child.pid, port: 4173, started: new Date().toISOString(), owner: 'verify.mjs (this invocation)' }, null, 2));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('Preview exited before ready');
    if (launchOutput.includes('http://127.0.0.1:4173')) {
      try { await doctor(); ready = true; break; } catch { /* Retry until the bounded readiness deadline. */ }
    }
    await delay(200);
  }
  if (!ready) throw new Error('Preview did not become ready within 12 seconds');
  if (process.argv.includes('--serve')) {
    await log('Launch: ready; --serve keeps this owned process until Ctrl-C.');
    const code = await new Promise(resolve => child.once('exit', resolve));
    if (code !== 0) throw new Error(`Preview exited with status ${code}`);
  } else {
    drive = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { stdio: ['ignore', 'pipe', 'pipe'] });
    drive.stdout.on('data', data => { process.stdout.write(data); void save(`${evidence}/drive.log`, data); });
    drive.stderr.on('data', data => { process.stderr.write(data); void save(`${evidence}/drive.log`, data); });
    const code = await new Promise((resolve, reject) => { drive.once('exit', resolve); drive.once('error', reject); });
    if (code !== 0) throw new Error(`Playwright failed with status ${code}`);
    await log('Drive: automated checks passed. Human exploration remains untested.');
  }
} finally { await cleanup(); await writes; }
