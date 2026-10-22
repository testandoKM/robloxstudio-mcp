#!/usr/bin/env node
// Directed, user-authorized component test in the already-open VFX TEST.
// Loads compiled TestHandlers/StopPlayMonitor without installing a plugin,
// changing HTTP, saving the place, launching Studio or touching other places.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeService } from '../../packages/core/dist/bridge-service.js';
import { RobloxStudioTools } from '../../packages/core/dist/tools/index.js';

assert(process.argv.includes('--vfx-directed'), 'Requires the explicitly authorized VFX MCP controller');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const fixtureName = `__ForkPlaytest_${runId}`;
const key = `ForkPlaytest_${runId}`;
const instance = `instance:fork-${runId}`;
const settingsPrefix = `ForkProbe_${runId}_`;
const pluginExpr = "game:GetService('PluginDebugService'):FindFirstChild('user_MCPPlugin.rbxmx')";
const requestPath = path.join(root, 'local/vfx-playtest-control-request.json');
const replyPath = path.join(root, 'local/vfx-playtest-control-reply.json');
const reportPath = path.join(root, `local/vfx-automatic-play-${runId}.json`);
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const lua = (value) => JSON.stringify(value);
const installed = [path.join(process.env.LOCALAPPDATA, 'Roblox/Plugins/MCPPlugin.rbxmx'),
  path.join(process.env.LOCALAPPDATA, 'Roblox/ChrrxsMCP-3.2.0/node_modules/@chrrxs/robloxstudio-mcp/dist/index.js')];
const report = { runId, placeId: 76624397270311, gameId: 10764893534,
  installedBefore: installed.map(hash), sourceHashes: {}, events: [], passed: false };
let fixtureCreated = false;
let playRequested = false;
let stopRequested = false;
let cleanupVerified = false;
let nativeIdle = false;
mkdirSync(path.join(root, 'local'), { recursive: true });
// Keep evidence if the PC/process exits before finally can run. An incomplete
// checkpoint is never a passed run and must be reconciled before another test.
function checkpoint() { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
checkpoint();

async function controller(payload) {
  const callId = randomUUID();
  report.pendingControl = { callId, kind: payload.kind, dataModel: payload.dataModel, at: new Date().toISOString() };
  checkpoint();
  writeFileSync(requestPath, JSON.stringify({ callId, runId, ...payload }));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    let answer;
    try { answer = JSON.parse(readFileSync(replyPath, 'utf8')); } catch { /* Waiting for the controller. */ }
    if (answer?.callId === callId) {
      if (!answer.ok) throw new Error(answer.error ?? 'VFX controller failed');
      delete report.pendingControl;
      return answer.result;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${payload.kind}; reconcile this call before retrying`);
}
function control(code, dataModel = 'Edit', sourceWrite = false) {
  return controller({ kind: 'execute', dataModel, sourceWrite,
    code: `assert(game.PlaceId==${report.placeId} and game.GameId==${report.gameId}, 'VFX identity changed'); ${code}` });
}

// MCP is the transport adapter for this directed test. Core routing and stop
// observation are production code; peer metadata below represents native VMs
// observed by the controller, not a claim that their WebSockets were tested.
class FixtureBridge extends BridgeService {
  notifyPeerRegistered() {}
  async sendRequest(endpoint) {
    assert(['/api/stop-playtest', '/api/playtest-state'].includes(endpoint));
    const handler = endpoint === '/api/stop-playtest' ? 'stopPlaytest' : 'getPlaytestState';
    const reply = await control(`local h=assert(_G[${lua(key)}]).handlers; local result=h.${handler}({}); return {result=result,state=h.getPlaytestState({})}`);
    if (reply.state.editModeReady === true && reply.state.playtestTaskPending === false) {
      for (const peer of this.getPeers()) if (peer.role !== 'edit') this.unregisterPeer(peer.peerId);
    }
    return reply.result;
  }
}
const bridge = new FixtureBridge();
const tools = new RobloxStudioTools(bridge);
function registerRole(role, cycle = 0) {
  const peerId = `peer:fork-${runId}-${role}-${cycle}`;
  bridge.registerPeer({ peerId, transportPeerId: peerId, instanceId: instance, role,
    placeId: report.placeId, placeName: 'VFX TEST', dataModelName: 'VFX TEST', isRunning: role !== 'edit' });
}

const modules = ['handlers/TestHandlers', 'StopPlayMonitor', 'PeerRole'].map((name) => {
  const file = path.join(root, `studio-plugin/out/modules/${name}.luau`);
  report.sourceHashes[name] = hash(file);
  return { path: ['modules', ...name.split('/')], source: readFileSync(file, 'utf8') };
});
modules.push(
  { path: ['modules', 'PluginSession'], source: `local pending=0; local prepared=0; local completed=0; return {
getInstanceId=function() return '${instance}' end,
prepareSoloTest=function() pending+=1; prepared+=1; return {token=prepared,testArgs={}} end,
finishTest=function() pending-=1; completed+=1 end,
snapshot=function() return {pending=pending,prepared=prepared,completed=completed} end}` },
  { path: ['include', 'RuntimeLib'], source: 'return {import=function(_,parent,...) for _,name in ipairs({...}) do parent=parent:FindFirstChild(name); assert(parent) end; return require(parent) end}' },
  { path: ['node_modules', '@rbxts', 'services'], source: 'return {HttpService=game:GetService("HttpService"),RunService=game:GetService("RunService"),Players=game:GetService("Players")}' },
);
function loadModules(name, dataModel) {
  return control(`local p=${pluginExpr}; assert(p and not p:FindFirstChild(${lua(name)}));
local root=Instance.new('Folder'); root.Name=${lua(name)}; root.Archivable=false; root:SetAttribute('ForkRun',${lua(runId)}); root.Parent=p;
local entry=Instance.new('Script'); entry.Name='MCPPlugin'; entry.Disabled=true; entry.Parent=root;
local sources=game:GetService('HttpService'):JSONDecode(${lua(JSON.stringify(modules))});
for _,row in ipairs(sources) do local parent=entry; for i,name in ipairs(row.path) do
if i<#row.path then local f=parent:FindFirstChild(name) or Instance.new('Folder'); f.Name=name; f.Parent=parent; parent=f
else local m=Instance.new('ModuleScript'); m.Name=name; m.Source=row.source; m.Parent=parent end end end;
local monitor=require(entry.modules.StopPlayMonitor);
local prefix=${lua(settingsPrefix)};
local adapter={GetSetting=function(_,k) return p:GetSetting(prefix..k) end,SetSetting=function(_,k,v) p:SetSetting(prefix..k,v) end};
monitor.init(adapter);
local f={root=root,monitor=monitor,session=require(entry.modules.PluginSession)}; _G[${lua(key)}]=f;
if game:GetService('RunService'):IsEdit() then f.handlers=require(entry.modules.handlers.TestHandlers)
else assert(game:GetService('RunService'):IsServer() and game:GetService('RunService'):IsRunning());
monitor.startMonitor({beforeEndTest=function() f.stopObserved=true end,afterEndTestFailure=function() f.endFailed=true end}) end;
return {loaded=true,isEdit=game:GetService('RunService'):IsEdit()};`, dataModel, true);
}

try {
  const before = await control(`assert(game:GetService('StudioTestService').EditModeActive, 'Native edit mode is not ready');
local children={}; for _,c in workspace:GetChildren() do table.insert(children,c.Name..':'..c.ClassName) end; table.sort(children);
return {http=game:GetService('HttpService').HttpEnabled,children=children}`);
  report.before = before;
  nativeIdle = true;
  // Mark before dispatch so even a lost loader reply triggers cleanup of our own root.
  fixtureCreated = true;
  await loadModules(fixtureName, 'Edit');
  registerRole('edit');
  for (const [index, mode] of ['play', 'play'].entries()) {
    const cycle = index + 1;
    playRequested = true;
    nativeIdle = false;
    stopRequested = false;
    const start = await control(`local f=assert(_G[${lua(key)}]); local result=f.handlers.startPlaytest({mode=${lua(mode)}});
local duplicate; if result.success then duplicate=f.handlers.startPlaytest({mode=${lua(mode)}}) end;
return {result=result,duplicate=duplicate,session=f.session.snapshot()}`);
    report.events.push({ event: 'start', cycle, mode, ...start });
    assert.equal(start.result.success, true, JSON.stringify(start.result));
    assert.notEqual(start.duplicate?.success, true, 'A pending native start must not be admitted again');
    assert.equal(start.session.prepared, cycle, 'Only one preparation per cycle');
    const runtime = await controller({ kind: 'wait-runtime', mode });
    assert.equal(runtime.server, true);
    if (mode === 'play') assert.equal(runtime.client, true);
    report.events.push({ event: 'runtime', cycle, mode, ...runtime });
    registerRole('server', cycle);
    if (mode === 'play') registerRole('client-1', cycle);
    await loadModules(`${fixtureName}_Server_${cycle}`, 'Server');
    const stoppedAt = Date.now();
    stopRequested = true;
    const result = JSON.parse((await tools.stopPlaytest(instance)).content[0].text);
    const stop = { result, ...await control(`local f=assert(_G[${lua(key)}]); return {session=f.session.snapshot(),editModeReady=game:GetService('StudioTestService').EditModeActive}`) };
    report.events.push({ event: 'stop', cycle, mode, elapsedMs: Date.now() - stoppedAt, ...stop });
    assert.equal(stop.result.success, true, JSON.stringify(stop.result));
    assert.equal(stop.editModeReady, true);
    assert.equal(stop.session.pending, 0);
    assert.equal(stop.session.completed, cycle);
    await controller({ kind: 'confirm-edit' });
    playRequested = false;
    nativeIdle = true;
  }
  report.cyclesPassed = true;
} catch (error) {
  report.error = error.message;
} finally {
  if (playRequested) {
    try {
      report.playCleanup = await controller({ kind: 'cleanup-play', stopAlreadyRequested: stopRequested });
      nativeIdle = report.playCleanup.editReady === true && report.playCleanup.playtestTaskPending === false;
    }
    catch (error) { report.playCleanupError = error.message; }
  }
  if (fixtureCreated && nativeIdle) {
    try {
      report.cleanup = await control(`local p=${pluginExpr}; local f=_G[${lua(key)}];
if f then f.monitor.clearPending() end;
local setting=${lua(settingsPrefix + 'MCP_STOP_PLAY_' + instance)};
p:SetSetting(setting,nil); p:SetSetting(setting..'_RESULT',nil);
local r=p:FindFirstChild(${lua(fixtureName)}); if r then assert(r:GetAttribute('ForkRun')==${lua(runId)}); r:Destroy() end; _G[${lua(key)}]=nil;
local children={}; for _,c in workspace:GetChildren() do table.insert(children,c.Name..':'..c.ClassName) end; table.sort(children);
return {cleaned=not p:FindFirstChild(${lua(fixtureName)}),settingsCleared=p:GetSetting(setting)==nil and p:GetSetting(setting..'_RESULT')==nil,
http=game:GetService('HttpService').HttpEnabled,editModeReady=game:GetService('StudioTestService').EditModeActive,children=children};`, 'Edit', true);
      assert.equal(report.cleanup.cleaned, true);
      assert.equal(report.cleanup.settingsCleared, true);
      assert.equal(report.cleanup.http, report.before.http);
      assert.equal(report.cleanup.editModeReady, true);
      assert.deepEqual(Object.values(report.cleanup.children), Object.values(report.before.children));
      cleanupVerified = true;
    } catch (error) { report.cleanupError = error.message; report.passed = false; }
  } else if (fixtureCreated) {
    // Destroying the module while Execute* is yielding can orphan its native
    // call. Preserve it until the controller observes readiness and unwinding.
    report.cleanupPending = true;
    report.cleanupError = 'Native execution has not drained; retain the fixture and reconcile before cleanup/retry.';
  }
  report.installedAfter = installed.map(hash);
  await tools.dispose();
  report.installationPreserved = JSON.stringify(report.installedBefore) === JSON.stringify(report.installedAfter);
  report.passed = report.cyclesPassed === true && cleanupVerified && report.installationPreserved;
  report.completed = true;
  checkpoint();
  writeFileSync(requestPath, JSON.stringify({ runId, kind: 'complete', passed: report.passed }));
  console.log(JSON.stringify(report, null, 2));
}
assert.equal(report.passed, true, report.error ?? report.cleanupError ?? 'Native VFX playtest failed');
