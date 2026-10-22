import * as path from 'path';
import * as fs from 'fs';
import * as vm from 'vm';
import { build } from 'esbuild';

let source: string;
beforeAll(async () => {
  const cwd = process.cwd();
  const root = fs.existsSync(path.join(cwd, 'studio-plugin')) ? cwd : path.resolve(cwd, '../..');
  source = (await build({ entryPoints: [path.join(root, 'studio-plugin/src/modules/PluginScope.ts')], bundle: true,
    write: false, platform: 'node', format: 'cjs', logLevel: 'silent' })).outputFiles[0].text;
});

function load(scope?: unknown) {
  const commonJs = { exports: {} };
  const plugin = { IsA: (name: string) => name === 'Plugin' };
  const root = { Parent: plugin, GetAttribute: () => scope, IsA: () => false };
  const folder = { Parent: root, IsA: () => false };
  const context = vm.createContext({ module: commonJs, exports: commonJs.exports,
    script: { Parent: folder }, typeIs: (v: unknown, type: string) => typeof v === type,
    error: (message: string) => { throw new Error(message); } });
  vm.runInContext(`String.prototype.size=function(){return this.length};
    const originalMatch=String.prototype.match;
    String.prototype.match=function(p){return originalMatch.call(this,new RegExp(p.replace('%w','a-zA-Z0-9'))) || []};`, context);
  vm.runInContext(source, context);
  return commonJs.exports as { name(base: string): string; isolated: boolean; settings(store: Store): Store };
}
interface Store { GetSetting(key: string): unknown; SetSetting(key: string, value: unknown): void }

test('default scope preserves identifiers and the native settings store', () => {
  const scope = load();
  const store: Store = { GetSetting: () => undefined, SetSetting: () => undefined };
  expect(scope.isolated).toBe(false);
  expect(scope.name('__MCPClientBroker')).toBe('__MCPClientBroker');
  expect(scope.settings(store)).toBe(store);
});

test('two complete plugin scopes cannot overwrite installed or each other settings', () => {
  const values = new Map<string, unknown>([['MCP_URL', 'installed']]);
  const store: Store = { GetSetting: key => values.get(key), SetSetting: (key, value) => { values.set(key, value); } };
  const first = load('ForkA'), second = load('ForkB');
  first.settings(store).SetSetting('MCP_URL', 'first');
  second.settings(store).SetSetting('MCP_URL', 'second');
  expect(first.settings(store).GetSetting('MCP_URL')).toBe('first');
  expect(second.settings(store).GetSetting('MCP_URL')).toBe('second');
  expect(values.get('MCP_URL')).toBe('installed');
  expect(first.name('__MCPSessionIdentity')).not.toBe(second.name('__MCPSessionIdentity'));
});

test.each(['', '../installed', 'a'.repeat(49), 123])('rejects invalid root scope %p', value => {
  expect(() => load(value)).toThrow('Invalid MCPIsolationScope');
});
