#!/usr/bin/env node
// Complete-package functional validation in an already-open, user-selected VFX
// Studio. Native Plugin objects and a launch-only bootstrap replace installation;
// every packaged source, production handler, broker, UI and transport is real.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { SaxesParser } from 'saxes';

assert(process.argv.includes('--vfx-directed'), 'Requires the authorized VFX MCP controller');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const scope = `ForkVFX_${runId}`;
const key = `ForkPackage_${runId}`;
const gameRoot = `__ForkPackage_${runId}`;
const requestPath = path.join(root, 'local/vfx-package-control-request.json');
const replyPath = path.join(root, 'local/vfx-package-control-reply.json');
const reportPath = path.join(root, `local/vfx-package-${runId}.json`);
const artifact = path.join(root, 'studio-plugin/MCPPlugin.rbxmx');
const dist = path.join(root, 'packages/robloxstudio-mcp/dist/index.js');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const lua = JSON.stringify;
const installed = [path.join(process.env.LOCALAPPDATA, 'Roblox/Plugins/MCPPlugin.rbxmx'),
  path.join(process.env.LOCALAPPDATA, 'Roblox/ChrrxsMCP-3.2.0/node_modules/@chrrxs/robloxstudio-mcp/dist/index.js')];
const report = { runId, scope, placeId: 76624397270311, gameId: 10764893534, passed: false,
  artifactSha256: hash(artifact), serverSha256: hash(dist), installedBefore: installed.map(hash), events: [] };
mkdirSync(path.join(root, 'local'), { recursive: true });
const checkpoint = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
checkpoint();

// Parse the actual built artifact, including its version/icon substitutions and
// full roblox-ts runtime. Do not substitute hand-written modules or handlers.
const nodes = [], stack = [];
let property, textValue = '';
const parser = new SaxesParser();
parser.on('opentag', tag => {
  if (tag.name === 'Item') {
    const node = { id: nodes.length + 1, parent: stack.at(-1)?.id, className: tag.attributes.class, name: '', source: undefined };
    nodes.push(node); stack.push(node);
  } else if (tag.attributes.name && stack.length) { property = tag.attributes.name; textValue = ''; }
});
parser.on('text', value => { if (property) textValue += value; });
parser.on('cdata', value => { if (property) textValue += value; });
parser.on('closetag', tag => {
  if (tag.name === 'Item') stack.pop();
  else if (property && stack.length && ['string', 'ProtectedString', 'bool'].includes(tag.name)) {
    if (property === 'Name') stack.at(-1).name = textValue;
    if (property === 'Source') stack.at(-1).source = textValue;
    property = undefined;
  }
});
parser.write(readFileSync(artifact, 'utf8')).close();
assert.equal(nodes[0].className, 'Script'); assert.equal(nodes[0].name, 'MCPPlugin');
assert(nodes.filter(n => n.className === 'ModuleScript').length >= 44);
report.packagedModules = nodes.filter(n => n.className === 'ModuleScript').length;
const mainSource = nodes[0].source;
// Studio's command loader also has a 200k Source limit. A packaged dependency
// larger than that can be cloned read-only from the installed tree ONLY when
// its native SHA-256 matches this artifact exactly; never silently omit it.
const transferNodes = nodes.map(node => {
  if (!node.source || node.source.length < 150000) return node;
  const names = []; let current = node;
  while (current.parent) { names.unshift(current.name); current = nodes[current.parent - 1]; }
  return { ...node, source: undefined, templatePath: names,
    sourceSha256: createHash('sha256').update(node.source).digest('hex') };
});
const bootstrap = `local plugin=script.Parent\nlocal script=plugin:FindFirstChild('MCPPlugin')\n${mainSource}\nreturn true`;
report.bootstrap = 'Native Plugin binding and entrypoint execution only; all artifact Sources remain unchanged.';

async function controller(payload) {
  const callId = randomUUID();
  report.pendingControl = { callId, kind: payload.kind, dataModel: payload.dataModel, at: new Date().toISOString() }; checkpoint();
  writeFileSync(requestPath, JSON.stringify({ callId, runId, ...payload }));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    let reply; try { reply = JSON.parse(readFileSync(replyPath, 'utf8')); } catch { /* Waiting. */ }
    if (reply?.callId === callId) {
      if (!reply.ok) throw new Error(reply.error ?? 'VFX controller failed');
      delete report.pendingControl; return reply.result;
    }
    await delay(200);
  }
  throw new Error(`Controller ${payload.kind} timed out; reconcile before retrying`);
}
function control(code, dataModel = 'Edit', sourceWrite = false) {
  return controller({ kind: 'execute', dataModel, sourceWrite,
    code: `assert(game.PlaceId==${report.placeId} and game.GameId==${report.gameId}, 'VFX identity changed'); ${code}` });
}
const lease = createServer(); await new Promise(r => lease.listen(0, '127.0.0.1', r));
const port = lease.address().port; await new Promise(r => lease.close(r));
const auth = randomUUID();
let child, output = '', rpcId = 0, nativeIdle = true, startedPlay = false, editLoaded = false, stopRequested = false;
const pending = new Map();
function rpc(method, params, timeout = 40000) {
  const id = ++rpcId;
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC ${method} timed out`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
  });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); return promise;
}
async function startServer() {
  let buffer = ''; output = '';
  child = spawn(process.execPath, [dist], { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ROBLOX_STUDIO_PORT: String(port), ROBLOX_STUDIO_HOST: '127.0.0.1',
      ROBLOX_STUDIO_AUTH_TOKEN: auth, ROBLOX_STUDIO_NO_AUTH: '', ROBLOX_STUDIO_REQUIRE_PRIMARY: '1',
      ROBLOXSTUDIO_MCP_MANAGED_INSTANCE_REGISTRY_DIR: path.join(root, `local/package-registry-${runId}`) } });
  child.stderr.on('data', d => { output += d; });
  child.stdout.on('data', data => {
    buffer += data;
    let nl; while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      const item = pending.get(msg.id); if (!item) continue;
      clearTimeout(item.timer); pending.delete(msg.id);
      if (msg.error) item.reject(new Error(JSON.stringify(msg.error))); else item.resolve(msg.result);
    }
  });
  child.on('exit', code => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`Isolated server exited (${code})`)); }
    pending.clear();
  });
  await waitFor(() => output.includes('running on stdio'), 30000, 'full server startup');
  assert(output.includes('(primary mode)'), 'Refuse proxying to the installed server');
  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vfx-package-test', version: '1' } });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
  report.protocolVersion = init.protocolVersion;
}
async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise(r => child.once('exit', r)); child.kill(); await exited;
}
async function tool(name, args = {}, timeout = 45000) {
  report.lastTool = { name, target: args.target, at: new Date().toISOString() }; checkpoint();
  const reply = await rpc('tools/call', { name, arguments: args }, timeout);
  const data = reply.structuredContent ?? JSON.parse(reply.content.find(c => c.type === 'text').text);
  if (reply.isError || data.success === false || data.error) throw new Error(`${name}: ${JSON.stringify(data)}`);
  return data;
}
async function waitFor(predicate, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await delay(400); }
  throw new Error(`Timed out: ${label}`);
}
const snapshot = () => tool('get_connected_instances');
let instance;
function execute(code, target = 'edit', operation_id = randomUUID()) {
  return tool('execute_luau', { instance_id: instance, target, operation_id,
    code: `assert(game.PlaceId==${report.placeId} and game.GameId==${report.gameId}); ${code}` });
}
function luauResult(reply) { try { return JSON.parse(reply.returnValue); } catch { return reply.returnValue; } }
async function mount(dataModel) {
  await control(`assert(not _G[${lua(key)}]);local p=PluginManager():CreatePlugin();p.Name=${lua(scope)};p.Archivable=false;
_G[${lua(key)}]={plugin=p,nodes={},bootFinished=false};return {prepared=true};`, dataModel, true);
  // Source assignments are chunked and verified immediately against the artifact.
  let chunk = [], bytes = 0;
  const flush = async () => {
    if (!chunk.length) return;
    await control(`local f=assert(_G[${lua(key)}]);local rows=game:GetService('HttpService'):JSONDecode(${lua(JSON.stringify(chunk))});
for _,row in ipairs(rows) do local n;
if row.templatePath then
local template=assert(game:GetService('PluginDebugService'):FindFirstChild('user_MCPPlugin.rbxmx')).MCPPlugin;
for _,name in ipairs(row.templatePath) do template=assert(template:FindFirstChild(name)) end;
local digest=game:GetService('EncodingService'):ComputeStringHash(template.Source,Enum.HashAlgorithm.Sha256);
local hex=string.gsub(digest,'.',function(c)return string.format('%02x',string.byte(c)) end);
assert(hex==row.sourceSha256,'Installed template does not match the complete artifact');assert(#template:GetChildren()==0);n=assert(template:Clone());
else n=Instance.new(row.className) end;
n.Name=row.name;if n:IsA('Script') then n.Disabled=true end;
if row.source then n.Source=row.source;assert(n.Source==row.source,'Artifact Source parity failed') end;
n.Parent=row.parent and assert(f.nodes[row.parent]) or f.plugin;f.nodes[row.id]=n;end;
return {parity=true};`, dataModel, true); chunk = []; bytes = 0;
  };
  for (const node of transferNodes) { const size = JSON.stringify(node).length; if (bytes && bytes + size > 65000) await flush(); chunk.push(node); bytes += size; }
  await flush();
  await control(`local f=assert(_G[${lua(key)}]);local main=f.nodes[1];main.Archivable=false;main:SetAttribute('MCPIsolationScope',${lua(scope)});
local settings=require(main.modules.PluginScope).settings(f.plugin);
settings:SetSetting('MCP_LAST_SUCCESSFUL_SERVER_URL_GLOBAL_V1','http://127.0.0.1:${port}');
local b=Instance.new('ModuleScript');b.Name='Bootstrap';b.Source=${lua(bootstrap)};b.Parent=f.plugin;f.bootstrap=b;
task.spawn(function()f.ok,f.result=pcall(require,b);f.bootFinished=true end);return {started=true};`, dataModel, true);
  const state = await control(`local f=assert(_G[${lua(key)}]);local deadline=tick()+12;while not f.bootFinished and tick()<deadline do task.wait(0.1) end;
return {bootFinished=f.bootFinished,ok=f.ok,result=tostring(f.result),nodes=#f.nodes};`, dataModel);
  assert.equal(state.ok, true, `${dataModel} entrypoint: ${state.result}`);
  report.events.push({ event: 'complete_package_loaded', dataModel, sourcesVerified: nodes.filter(n => n.source !== undefined).length }); checkpoint();
  const stateAfterLoad = await control(`local f=assert(_G[${lua(key)}]);local m=f.nodes[1].modules;local s=require(m.State).getActiveConnection();
return {role=require(m.PeerRole).detect(),version=require(m.State).CURRENT_VERSION,instanceId=require(m.PluginSession).getInstanceId(),active=s.isActive,connected=s.lastHttpOk,detail=s.transportDetail};`, dataModel);
  report.events.push({ event: 'native_package_state', dataModel, ...stateAfterLoad }); checkpoint();
}

try {
  report.before = await control(`assert(game:GetService('StudioTestService').EditModeActive);local list={};for _,c in workspace:GetChildren() do table.insert(list,c.Name..':'..c.ClassName) end;table.sort(list);
return {http=game:GetService('HttpService').HttpEnabled,children=list};`);
  await startServer();
  const listed = await rpc('tools/list', {}); report.toolCount = listed.tools.length; assert(listed.tools.some(t => t.name === 'solo_playtest'));
  await control(`game:GetService('HttpService').HttpEnabled=true;return {enabled=true}`, 'Edit', true);
  editLoaded = true; await mount('Edit');
  instance = await waitFor(async () => (await snapshot()).instances.find(i => i.placeId === report.placeId)?.id, 35000, 'full edit peer');
  report.instanceId = instance;
  const info = await tool('get_place_info', { instance_id: instance }); assert.equal(info.placeId, report.placeId);
  const ui = await control(`local f=assert(_G[${lua(key)}]);local m=f.nodes[1].modules;local u=require(m.UI).getElements();local s=require(m.PluginSession);
return {widget=u.screenGui.ClassName,title=u.screenGui.Title,version=require(m.State).CURRENT_VERSION,instanceId=s.getInstanceId(),identity=require(m.PluginScope).name('__MCPSessionIdentity')};`);
  assert.equal(ui.widget, 'DockWidgetPluginGui'); assert.equal(ui.instanceId, instance); report.ui = ui;
  await execute(`assert(not workspace:FindFirstChild(${lua(gameRoot)}));local f=Instance.new('Folder');f.Name=${lua(gameRoot)};f:SetAttribute('ForkRun',${lua(runId)});f.Parent=workspace;
local p=Instance.new('Part');p.Name='Probe';p.Anchored=true;p.Parent=f;local m=Instance.new('ModuleScript');m.Name='SourceProbe';m.Parent=f;return true;`);
  await tool('set_properties', { instance_id: instance, instancePath: `game.Workspace.${gameRoot}.Probe`, properties: { Transparency: 0.35 } });
  const source = `return {marker='${scope}',value=42}`;
  await tool('set_script_source', { instance_id: instance, instancePath: `game.Workspace.${gameRoot}.SourceProbe`, source });
  const read = await tool('get_script_source', { instance_id: instance, instancePath: `game.Workspace.${gameRoot}.SourceProbe` });
  assert(JSON.stringify(read).includes(scope));
  const op = randomUUID(); const code = `local f=workspace[${lua(gameRoot)}];f:SetAttribute('Writes',(f:GetAttribute('Writes') or 0)+1);return true;`;
  await execute(code, 'edit', op); await execute(code, 'edit', op);
  const verification = luauResult(await execute(`local f=workspace[${lua(gameRoot)}];return {transparency=f.Probe.Transparency,writes=f:GetAttribute('Writes')}`));
  assert(Math.abs(verification.transparency - 0.35) < 0.00001, JSON.stringify(verification));
  assert.equal(verification.writes, 1);
  report.events.push({ event: 'edit_tools_and_dedup_passed' }); checkpoint();
  await stopServer(); await delay(1000); await startServer();
  await waitFor(async () => (await snapshot()).instances.some(i => i.id === instance), 35000, 'full package reconnect');
  assert.equal((await tool('get_place_info', { instance_id: instance })).placeId, report.placeId);
  report.events.push({ event: 'full_server_restart_reconnected' }); checkpoint();
  for (let cycle = 1; cycle <= 2; cycle++) {
    startedPlay = true; nativeIdle = false; stopRequested = false;
    // Runtime bootstrap is delivered over the external controller instead of
    // Studio's installed-plugin auto-loader; include that artificial latency.
    const starting = tool('solo_playtest', { action: 'start', mode: 'play', timeout: 180, instance_id: instance }, 220000)
      .then(value => ({ value }), error => ({ error: error.message }));
    await controller({ kind: 'wait-runtime' });
    await mount('Server'); await mount('Client');
    const start = await starting;
    report.runtimeTopology = await snapshot(); checkpoint();
    assert(!start.error, start.error); assert.equal(start.value.success, true);
    for (const target of ['server', 'client-1']) {
      const result = luauResult(await execute(`assert(game:GetService('RunService'):IsRunning());print(${lua(scope)}..' '..${lua(target)});return {running=true,side=${lua(target)}};`, target));
      assert.equal(result.running, true);
    }
    const serverEval = await tool('eval_server_runtime', { instance_id: instance,
      code: `assert(game.PlaceId==${report.placeId});return require(workspace[${lua(gameRoot)}].SourceProbe).marker` });
    const clientEval = await tool('eval_client_runtime', { instance_id: instance, target: 'client-1',
      code: `assert(game.PlaceId==${report.placeId});return require(workspace[${lua(gameRoot)}].SourceProbe).value` });
    assert(JSON.stringify(serverEval).includes(scope)); assert(JSON.stringify(clientEval).includes('42'));
    if (cycle === 1) {
      const profiler = await tool('capture_micro_profiler', { instance_id: instance, target: 'client-1', duration_ms: 250,
        focus: 'all', max_timers: 5, max_groups: 5, max_events: 10000, frame_window: 30 }, 120000);
      assert.equal(profiler.ok, true);
      assert(profiler.counts?.buffer_bytes > 0 && profiler.counts?.sampled_frames > 0);
      report.events.push({ event: 'packaged_micro_profiler_passed', backend: profiler.backend,
        bufferBytes: profiler.counts.buffer_bytes, frames: profiler.counts.sampled_frames }); checkpoint();
    }
    const logs = await tool('get_runtime_logs', { instance_id: instance, filter: scope, tail: 30 });
    assert(!JSON.stringify(logs).includes('"level":"ERR"'), 'New scoped runtime errors');
    report.events.push({ event: 'real_runtime_broker_and_eval_passed', cycle }); checkpoint();
    stopRequested = true; const started = Date.now();
    const stop = await tool('solo_playtest', { action: 'stop', timeout: 120, instance_id: instance }, 160000);
    assert.equal(stop.success, true); nativeIdle = true; startedPlay = false;
    await controller({ kind: 'confirm-edit' });
    report.events.push({ event: 'complete_play_stop_passed', cycle, elapsedMs: Date.now() - started }); checkpoint();
  }
  report.functionalPassed = true;
} catch (error) { report.error = error.message; }
finally {
  if (startedPlay) {
    try { const state = await controller({ kind: 'cleanup-play', stopAlreadyRequested: stopRequested }); nativeIdle = state.editReady && !state.playtestTaskPending; }
    catch (error) { report.playCleanupError = error.message; }
  }
  if (editLoaded && nativeIdle) {
    try {
      report.cleanup = await control(`local f=_G[${lua(key)}];local modules=f and f.nodes[1].modules;local identity;
if modules and f.bootstrap then local session=require(modules.PluginSession);assert(not require(modules.handlers.TestHandlers).getPlaytestState({}).playtestTaskPending);
require(modules.Communication).deactivateAll();session.dispose();require(modules.RuntimeLogBuffer).uninstall();require(modules.RenderMonitor).stop();
identity=require(modules.PluginScope).name('__MCPSessionIdentity');
local keys={'MCP_LAST_SUCCESSFUL_SERVER_URL_GLOBAL_V1','MCP_LAST_SUCCESSFUL_SERVER_URL_place:${report.placeId}','MCP_STOP_PLAY_'..session.getInstanceId(),'MCP_STOP_PLAY_'..session.getInstanceId()..'_RESULT'};
for _,k in ipairs(keys) do f.plugin:SetSetting(require(modules.PluginScope).name(k),nil) end;
local u=require(modules.UI).getElements();if u then u.screenGui:Destroy() end;end;
local w=workspace:FindFirstChild(${lua(gameRoot)});if w then assert(w:GetAttribute('ForkRun')==${lua(runId)});w:Destroy() end;
if identity then local i=game:GetService('CoreGui'):FindFirstChild(identity);if i then i:Destroy() end end;
if f then f.plugin:Destroy() end;_G[${lua(key)}]=nil;
game:GetService('HttpService').HttpEnabled=${report.before?.http ? 'true' : 'false'};
local list={};for _,c in workspace:GetChildren() do table.insert(list,c.Name..':'..c.ClassName) end;table.sort(list);
return {cleaned=_G[${lua(key)}]==nil and not workspace:FindFirstChild(${lua(gameRoot)}),http=game:GetService('HttpService').HttpEnabled,children=list,editReady=game:GetService('StudioTestService').EditModeActive};`, 'Edit', true);
      assert.equal(report.cleanup.cleaned, true); assert.equal(report.cleanup.editReady, true);
      assert.equal(report.cleanup.http, report.before.http);
      assert.deepEqual(Object.values(report.cleanup.children), Object.values(report.before.children));
    } catch (error) { report.cleanupError = error.message; }
    // Security property restoration must not depend on a partially loaded UI.
    try { report.httpRestored = await control(`game:GetService('HttpService').HttpEnabled=${report.before?.http ? 'true' : 'false'};return {restored=true};`, 'Edit', true); }
    catch (error) { report.httpRestoreError = error.message; }
  } else if (editLoaded) { report.cleanupPending = true; }
  await stopServer();
  report.installedAfter = installed.map(hash);
  report.installationPreserved = JSON.stringify(report.installedAfter) === JSON.stringify(report.installedBefore);
  report.passed = report.functionalPassed === true && report.cleanup?.cleaned === true && !report.cleanupError && !report.httpRestoreError && report.installationPreserved;
  report.completed = true; checkpoint();
  writeFileSync(requestPath, JSON.stringify({ runId, kind: 'complete', passed: report.passed }));
  console.log(JSON.stringify(report, null, 2));
}
assert.equal(report.passed, true, report.error ?? report.cleanupError ?? 'Complete package validation failed');
