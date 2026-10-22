#!/usr/bin/env node
// Passive observations plus one optional, read-only place-info request.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const options = { url: 'http://127.0.0.1:58741', samples: 1, intervalMs: 12000, probe: false };
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
  const name = args[index];
  if (name === '--probe') { options.probe = true; continue; }
  const key = ({ '--url': 'url', '--samples': 'samples', '--interval-ms': 'intervalMs', '--output': 'output', '--installed-root': 'installedRoot' })[name];
  if (!key || args[index + 1] === undefined) throw new Error(`Invalid argument: ${name}`);
  options[key] = args[++index];
}
options.samples = Number(options.samples);
options.intervalMs = Number(options.intervalMs);
if (!Number.isInteger(options.samples) || options.samples < 1 || options.samples > 10) throw new Error('Samples must be 1-10');
if (!Number.isInteger(options.intervalMs) || options.intervalMs < 0 || options.intervalMs > 30000) throw new Error('Interval must be 0-30000 ms');
const base = new URL(options.url);
if (base.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
  throw new Error('Use a loopback HTTP origin without credentials, query or path');
}
let outputPath;
if (options.output) {
  const localRoot = path.resolve(projectRoot, 'local');
  outputPath = path.resolve(projectRoot, options.output);
  const relative = path.relative(localRoot, outputPath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('Output must be a file inside this project local/ directory');
}

function healthSummary(health) {
  const active = health.activeWebSockets;
  const peers = (health.peers ?? []).map((peer) => ({
    instanceId: peer.instanceId, role: peer.role, placeId: peer.placeId,
    isRunning: peer.isRunning, pluginVersion: peer.pluginVersion, serverVersion: peer.serverVersion,
    lastActivity: peer.lastActivity, activityAgeMs: Date.now() - peer.lastActivity, connectedAt: peer.connectedAt,
  }));
  return {
    checkedAt: new Date().toISOString(), serverVersion: health.serverVersion,
    pluginConnected: health.pluginConnected, mcpServerActive: health.mcpServerActive,
    activeWebSockets: active, pendingRequests: health.pendingRequests, peerCount: health.peerCount,
    instances: (health.instances ?? []).map((instance) => ({ id: instance.id, placeId: instance.placeId })), peers,
    observation: active === 0 && peers.length > 0 ? 'registered_without_transport'
      : active > 0 ? 'transport_present_unverified' : 'no_registered_transport',
  };
}

const report = { collectedAt: new Date().toISOString(), bridge: base.origin, samples: [] };
if (options.installedRoot) {
  const root = path.resolve(options.installedRoot);
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const files = { server: path.join(root, 'dist/index.js'), bundledPlugin: path.join(root, 'studio-plugin/MCPPlugin.rbxmx') };
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) files.installedPlugin = path.join(process.env.LOCALAPPDATA, 'Roblox/Plugins/MCPPlugin.rbxmx');
  const hashes = {};
  for (const [label, file] of Object.entries(files)) {
    try { hashes[label] = createHash('sha256').update(await readFile(file)).digest('hex'); }
    catch { hashes[label] = null; }
  }
  report.installation = { name: manifest.name, version: manifest.version, sha256: hashes,
    pluginMatchesBundle: hashes.installedPlugin != null && hashes.installedPlugin === hashes.bundledPlugin };
}
for (let index = 0; index < options.samples; index += 1) {
  if (index > 0) await delay(options.intervalMs);
  try {
    const response = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Health request failed');
    const summary = healthSummary(await response.json());
    report.samples.push(summary);
    console.error(JSON.stringify({ checkedAt: summary.checkedAt, observation: summary.observation, activeWebSockets: summary.activeWebSockets, peerCount: summary.peerCount }));
  } catch (error) {
    report.samples.push({ checkedAt: new Date().toISOString(), observation: 'health_unreachable', error: error.name });
  }
}
if (options.probe) {
  const instances = report.samples.at(-1)?.instances ?? [];
  if (instances.length !== 1) report.probe = { attempted: false, reason: 'need_exactly_one_fresh_instance' };
  else {
    const started = Date.now();
    try {
      const token = (await readFile(path.join(homedir(), '.robloxstudio-mcp/auth-token'), 'utf8')).trim();
      const response = await fetch(new URL('/mcp/get_place_info', base), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MCP-Auth': token },
        body: JSON.stringify({ instance_id: instances[0].id }), signal: AbortSignal.timeout(35000),
      });
      const reply = await response.json();
      let data = reply.structuredContent ?? reply;
      if (!reply.structuredContent && reply.content?.[0]?.type === 'text') {
        try { data = JSON.parse(reply.content[0].text); } catch { /* Only known fields are recorded. */ }
      }
      const details = data.details ?? data.error?.details ?? data;
      report.probe = { attempted: true, tool: 'get_place_info', httpStatus: response.status, elapsedMs: Date.now() - started,
        failed: !response.ok || reply.isError === true || Boolean(data.error),
        errorCode: typeof data.error === 'string' ? data.error : data.code ?? data.error?.code,
        requestId: details.requestId, stage: details.stage, outcome: details.outcome, executionOutcome: details.executionOutcome };
    } catch (error) {
      report.probe = { attempted: true, tool: 'get_place_info', elapsedMs: Date.now() - started, failed: true, error: error.name };
    }
  }
}
const json = JSON.stringify(report, null, 2) + '\n';
if (outputPath) { await mkdir(path.dirname(outputPath), { recursive: true }); await writeFile(outputPath, json, { mode: 0o600 }); }
console.log(json);
