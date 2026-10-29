import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const local = resolve(root, '.tools/dotnet/dotnet.exe');
const dotnet = existsSync(local) ? local : 'dotnet';
const data = resolve(root, '.tools/e2e-data-' + Date.now());
mkdirSync(data, { recursive: true });
const env = { ...process.env, DataDirectory: data, DOTNET_ROOT: existsSync(local) ? resolve(root, '.tools/dotnet') : process.env.DOTNET_ROOT };
const args = ['run', '--no-build', '--project', resolve(root, 'src/ExpenseTracker.Api')];
const migrate = spawn(dotnet, [...args, '--', '--migrate'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
migrate.on('exit', code => {
  if (code) process.exit(code);
  const server = spawn(dotnet, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  process.on('SIGTERM', () => server.kill());
  process.on('SIGINT', () => server.kill());
  server.on('exit', code => process.exit(code ?? 0));
});
