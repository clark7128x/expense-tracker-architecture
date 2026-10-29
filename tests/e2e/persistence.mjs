import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../..');
const local = resolve(root, '.tools/dotnet/dotnet.exe');
const dotnet = existsSync(local) ? local : 'dotnet';
const data = resolve(root, '.tools/restart-data-' + Date.now());
mkdirSync(data, { recursive: true });
const env = { ...process.env, DataDirectory: data, DOTNET_ROOT: existsSync(local) ? resolve(root, '.tools/dotnet') : process.env.DOTNET_ROOT };
const dll = resolve(root, 'src/ExpenseTracker.Api/bin/Debug/net10.0/ExpenseTracker.Api.dll');
const cwd = resolve(root, 'src/ExpenseTracker.Api');
function start(args = []) { return spawn(dotnet, [dll, ...args], { env, cwd, stdio: 'ignore', windowsHide: true }); }
function exited(child) { return new Promise(resolve => child.once('exit', resolve)); }
async function ready() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch('http://localhost:5080/api/v1/categories')).ok) return; } catch { }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('API startup timeout');
}
assert.equal(await exited(start(['--migrate'])), 0);
let server = start();
try {
  await ready();
  const response = await fetch('http://localhost:5080/api/v1/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMinor: 12550, date: '2026-10-29', categoryId: 1 }) });
  assert.equal(response.status, 201);
  const expense = await response.json();
  let stopped = exited(server); server.kill(); await stopped;
  server = start(); await ready();
  const read = await fetch(`http://localhost:5080/api/v1/expenses/${expense.id}`);
  assert.equal((await read.json()).amountMinor, 12550);
  console.log('PASS: 12550 minor units survived a complete server process restart.');
} finally { const stopped = exited(server); server.kill(); await stopped; }
