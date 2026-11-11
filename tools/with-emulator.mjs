// Runs a command while the Firebase Auth + Database emulators are up (real rules from database.rules.json).
//   node tools/with-emulator.mjs node tools/rules-test.mjs --emulator
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cmd = process.argv.slice(2);
if (!cmd.length) {
  console.error('usage: node tools/with-emulator.mjs <command...>');
  process.exit(2);
}

// The sandbox proxy would otherwise intercept the CLI's calls to 127.0.0.1.
const env = { ...process.env, EMULATOR: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', HTTPS_PROXY_ORIG: process.env.HTTPS_PROXY || process.env.https_proxy || '' };
for (const k of Object.keys(env)) if (/^(https?_proxy|global_agent_.*proxy|yarn_https_proxy|docker_https_proxy|npm_config_https_proxy)$/i.test(k)) delete env[k];

const fb = spawn(join(root, 'tools/node_modules/.bin/firebase'), ['emulators:start', '--only', 'auth,database', '--project', 'xu-ly-tinh-huong'], {
  cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
fb.stdout.on('data', (d) => (log += d));
fb.stderr.on('data', (d) => (log += d));

const stop = () => { try { process.kill(-fb.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

const up = (port) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
const deadline = Date.now() + 120_000;
while (!((await up(9000)) && (await up(9099)))) {
  if (Date.now() > deadline || fb.exitCode !== null) {
    console.error('emulators did not start\n', log.slice(-2000));
    stop();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, 1500)); // let the rules finish loading

const child = spawn(cmd[0], cmd.slice(1), { cwd: root, env, stdio: 'inherit' });
child.on('exit', (code) => { stop(); setTimeout(() => process.exit(code ?? 1), 500); });
