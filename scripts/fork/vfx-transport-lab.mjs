#!/usr/bin/env node
// Exercise the built transport inside the user-selected VFX Studio process.
// No plugin installation, Studio launch, place save or publication occurs.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { BridgeService } from '../../packages/core/dist/bridge-service.js';
import { RobloxStudioTools } from '../../packages/core/dist/tools/index.js';
import { createHttpServer } from '../../packages/core/dist/http-server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const expectedPlace = 76624397270311;
const expectedGame = 10764893534;
const baseline = process.argv.includes('--baseline');
const cyclesArg = process.argv.indexOf('--play-cycles');
const playCycles = cyclesArg === -1 ? 0 : Number(process.argv[cyclesArg + 1]);
assert(Number.isInteger(playCycles) && playCycles >= 0 && playCycles <= 3 && !(baseline && playCycles), 'Use --play-cycles 1..3 only with the fork');
assert(process.argv.includes('--official-control'), 'Run with --official-control and the VFX MCP controller described in docs/fork/CONNECTION_RECOVERY.md');
const controlRequest = path.join(root, 'local/vfx-control-request.json');
const controlReply = path.join(root, 'local/vfx-control-reply.json');
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const artifact = path.join(root, 'studio-plugin/MCPPlugin.rbxmx');
const artifactHash = createHash('sha256').update(readFileSync(artifact)).digest('hex');
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const fixtureName = `__ForkTransport_${runId}`;
const key = `ForkTransport_${runId}`;
const fixtureParent = "game:GetService('PluginDebugService'):FindFirstChild('user_MCPPlugin.rbxmx')";
const testAuth = randomUUID();
const heldRegistrations = new Set();
const upgrades = [];
const upgradeSockets = new Set();
let faultActive = true;
let fixtureCreated = false;
let instance;
let moduleSources;
let playRequested = false;
let stopAttempted = false;
const unregisteredAt = new Map();
class FixtureBridge extends BridgeService {
  notifyPeerRegistered() {}
  unregisterPeer(peerId) { unregisteredAt.set(peerId, Date.now()); super.unregisterPeer(peerId); }
}
const bridge = new FixtureBridge();
const tools = new RobloxStudioTools(bridge);
const app = createHttpServer(tools, bridge, undefined, { name: 'fork-vfx-lab', version: manifest.version, tools: [] }, { authToken: testAuth });
const server = createServer((request, response) => {
  if (faultActive && request.method === 'POST' && request.url === '/ready') {
    request.resume();
    heldRegistrations.add(response);
    response.on('close', () => heldRegistrations.delete(response));
    return;
  }
  app(request, response);
});
app.attachStudioTransport(server);
server.on('upgrade', (request) => {
  const url = new URL(request.url, 'http://localhost');
  let version;
  try { version = JSON.parse(url.searchParams.get('registration') ?? '{}').pluginVersion; } catch { version = 'invalid_json'; }
  upgrades.push({ path: url.pathname, version });
  upgradeSockets.add(request.socket);
  request.socket.on('close', () => upgradeSockets.delete(request.socket));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
app.setMCPServerActive(true);
const releaseHeld = () => { faultActive = false; for (const response of heldRegistrations) response.end('released'); heldRegistrations.clear(); };
// A hard bound ensures native requests cannot be left held by a failed probe.
const safetyRelease = setTimeout(releaseHeld, 90000);
const lua = (value) => JSON.stringify(value);

async function toolAt(targetPort, token, name, args, timeout = 35000) {
  const response = await fetch(`http://127.0.0.1:${targetPort}/mcp/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MCP-Auth': token },
    body: JSON.stringify(args), signal: AbortSignal.timeout(timeout),
  });
  const reply = await response.json();
  let data = reply.structuredContent ?? reply;
  if (!reply.structuredContent && reply.content?.[0]?.type === 'text') {
    try { data = JSON.parse(reply.content[0].text); } catch { /* Preserve the public response. */ }
  }
  if (!response.ok || reply.isError || data.error) throw new Error(`${name} failed: ${data.error ?? response.status}`);
  return data;
}
async function controller(payload) {
  const callId = randomUUID();
  mkdirSync(path.join(root, 'local'), { recursive: true });
  writeFileSync(controlRequest, JSON.stringify({ callId, runId, ...payload }));
  const answer = await waitFor(() => {
    try { const item = JSON.parse(readFileSync(controlReply, 'utf8')); return item.callId === callId ? item : false; }
    catch { return false; }
  }, payload.kind === 'play' ? 120000 : 60000, 'VFX controller reply');
  if (!answer.ok) throw new Error(answer.error ?? 'Official VFX command failed');
  return answer.result;
}
async function control(code, dataModel = 'Edit') {
  assert(instance, 'VFX target must be verified before code execution');
  return controller({ kind: 'execute', dataModel,
    code: `assert(game.PlaceId == ${expectedPlace} and game.GameId == ${expectedGame}, 'VFX identity changed'); ${code}` });
}
async function waitFor(predicate, timeout, label) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await delay(250); }
  throw new Error(`Timed out: ${label}`);
}
async function runPlayCycles() {
  const startup = readFileSync(path.join(root, 'studio-plugin/out/server/init.server.luau'), 'utf8');
  assert(startup.includes('game:BindToClose(StudioWebSocket.suspendForShutdown)'), 'Shutdown binding must match the production entrypoint');
  for (let cycle = 1; cycle <= playCycles; cycle++) {
    const serverPeer = `peer:fork-${runId}-${cycle}`;
    const serverRoot = `${fixtureName}_Server_${cycle}`;
    const serverKey = `${key}_Server_${cycle}`;
    playRequested = true;
    stopAttempted = false;
    const startControl = await controller({ kind: 'play', action: 'start' });
    await control(`
assert(game:GetService('RunService'):IsRunning() and game:GetService('RunService'):IsServer(), 'Expected play server');
local parent=${fixtureParent}; assert(parent and not parent:FindFirstChild(${lua(serverRoot)}));
local root=Instance.new('Folder'); root.Name=${lua(serverRoot)}; root.Archivable=false; root:SetAttribute('ForkRun',${lua(runId)}); root.Parent=parent;
local entry=Instance.new('Script'); entry.Name='MCPPlugin'; entry.Disabled=true; entry.Parent=root;
local sources=game:GetService('HttpService'):JSONDecode(${lua(JSON.stringify(moduleSources))});
for _,row in ipairs(sources) do local target=entry; for i,name in ipairs(row.path) do
if i<#row.path then local f=target:FindFirstChild(name) or Instance.new('Folder'); f.Name=name; f.Parent=target; target=f
else local m=Instance.new('ModuleScript'); m.Name=name; m.Source=row.source; m.Parent=target end end end;
entry.modules.PluginSession.Source=${lua(`return {peerId='${serverPeer}',getRole=function() return 'server' end,getInstanceId=function() return '${instance}' end,getMultiplayerGroupId=function() return nil end,createReadyPayload=function() return {peerId='${serverPeer}',transportPeerId='${serverPeer}',instanceId='${instance}',role='server',placeId=game.PlaceId,placeName='VFX TEST',placeKey='place:'..game.PlaceId,dataModelName=game.Name,isRunning=true,pluginVersion='${manifest.version}',pluginVariant='main',timestamp=tick()} end}`)};
local transport=require(entry.modules.StudioWebSocket); local fixture={root=root,transport=transport,ready=false}; _G[${lua(serverKey)}]=fixture;
game:BindToClose(transport.suspendForShutdown);
transport.start({serverUrl='http://127.0.0.1:${port}',registerOnSocket=true,onReady=function() fixture.ready=true end,onStatus=function() end,onHeartbeat=function() end,onTransportUpdate=function() end,
dispatchRequest=function(req) if req.endpoint=='/api/place-info' then return {placeId=game.PlaceId,gameId=game.GameId,isRunning=game:GetService('RunService'):IsRunning(),isServer=game:GetService('RunService'):IsServer()} end; return {error='Unsupported fixture endpoint'} end});
return {loaded=true,cycle=${cycle}};`, 'Server');
    await waitFor(async () => bridge.getPeers().some((peer) => peer.peerId === serverPeer)
      && (await fetch(`http://127.0.0.1:${port}/health`).then((response) => response.json())).activeWebSockets === 2,
    20000, 'fork server registered and its channel open');
    const runtimeInfo = await bridge.sendRequest('/api/place-info', {}, serverPeer, 5000);
    assert.equal(runtimeInfo.placeId, expectedPlace);
    assert.equal(runtimeInfo.isRunning, true);
    assert.equal(runtimeInfo.isServer, true);
    const stopStarted = Date.now();
    stopAttempted = true;
    const stopControl = await controller({ kind: 'play', action: 'stop' });
    playRequested = false;
    await waitFor(() => unregisteredAt.has(serverPeer) && !bridge.getPeers().some((peer) => peer.peerId === serverPeer), 8000, 'fork BindToClose unregister');
    const unregisterMs = unregisteredAt.get(serverPeer) - stopStarted;
    assert(unregisterMs >= 0 && unregisterMs < 8000, 'Server must unregister promptly, rather than expire after 30 seconds');
    const state = await control(`return {isEdit=game:GetService('RunService'):IsEdit(),studioTestEditReady=game:GetService('StudioTestService').EditModeActive,isRunning=game:GetService('RunService'):IsRunning()}`);
    // This directed probe uses the native manual Play/Stop controller. Keep the
    // StudioTestService flag as evidence; it is not this controller's lifecycle
    // contract and must not be mistaken for a managed-test gate passing.
    assert.equal(state.isEdit, true);
    assert.equal(state.isRunning, false);
    assert.equal((await toolAt(port, testAuth, 'get_place_info', { instance_id: instance })).placeId, expectedPlace);
    report.events.push({ event: 'manual_play_stop_cycle_passed', cycle, unregisterMs, editResponded: true,
      startController: startControl.controller, stopController: stopControl.controller,
      studioTestEditReady: state.studioTestEditReady });
  }
}
const report = { runId, placeId: expectedPlace, gameId: expectedGame, version: manifest.version, artifactSha256: artifactHash, mode: baseline ? 'baseline' : playCycles ? 'play-stop' : 'fixed', events: [] };
try {
  instance = `instance:fork-${runId}`;
  const info = await control('return {placeId=game.PlaceId,gameId=game.GameId}');
  assert.equal(info.placeId, expectedPlace); assert.equal(info.gameId, expectedGame);
  const installedPlugin = path.join(process.env.LOCALAPPDATA, 'Roblox/Plugins/MCPPlugin.rbxmx');
  report.installedPluginBefore = createHash('sha256').update(readFileSync(installedPlugin)).digest('hex');
  await control(`local parent=${fixtureParent}; assert(parent and not parent:FindFirstChild(${lua(fixtureName)})); local f=Instance.new('Folder'); f.Name=${lua(fixtureName)}; f.Archivable=false; f:SetAttribute('ForkRun',${lua(runId)}); f.Parent=parent; return {created=true}`);
  fixtureCreated = true;
  {
    const transportSource = readFileSync(path.join(root, baseline ? 'local/StudioWebSocket.baseline.luau' : 'studio-plugin/out/modules/StudioWebSocket.luau'), 'utf8');
    report.transportSourceSha256 = createHash('sha256').update(transportSource).digest('hex');
    if (baseline) assert.equal(report.transportSourceSha256, 'e037d99bcd31fb140fbc0bbfbe4d606bd47bd5857bef242f93f7f5d61e9519bc', 'Baseline must match the retained upstream 3.2.1 transport');
    const modules = [
      { path: ['modules', 'StudioWebSocket'], source: transportSource },
      { path: ['modules', 'HttpDiagnostics'], source: readFileSync(path.join(root, 'studio-plugin/out/modules/HttpDiagnostics.luau'), 'utf8') },
      { path: ['modules', 'PluginSession'], source: 'return {}' },
      { path: ['include', 'RuntimeLib'], source: 'return {import=function(_,parent,...) for _,name in ipairs({...}) do parent=parent:FindFirstChild(name); assert(parent) end; return require(parent) end}' },
      { path: ['node_modules', '@rbxts', 'services'], source: 'return {HttpService=game:GetService("HttpService")}' },
    ];
    moduleSources = modules;
    await control(`local root=(${fixtureParent}):FindFirstChild(${lua(fixtureName)}); local entry=Instance.new('Script'); entry.Name='MCPPlugin'; entry.Disabled=true; entry.Parent=root; local sources=game:GetService('HttpService'):JSONDecode(${lua(JSON.stringify(modules))}); for _,row in ipairs(sources) do local parent=entry; for i,name in ipairs(row.path) do if i<#row.path then local f=parent:FindFirstChild(name) or Instance.new('Folder'); f.Name=name; f.Parent=parent; parent=f else local m=Instance.new('ModuleScript'); m.Name=name; m.Source=row.source; m.Parent=parent end end end; return {loaded=true}`);
  }
  const setup = await control(`
local root=(${fixtureParent}):FindFirstChild(${lua(fixtureName)}); assert(root:GetAttribute('ForkRun')==${lua(runId)});
local entry=root:FindFirstChild('MCPPlugin'); assert(entry and entry:IsA('Script')); entry.Disabled=true;
local modules=entry:FindFirstChild('modules'); assert(modules);
local peer='peer:fork-${runId}';
modules.PluginSession.Source=${lua(`local p='peer:fork-${runId}'; return {peerId=p,getRole=function() return 'edit' end,getInstanceId=function() return '${instance}' end,getMultiplayerGroupId=function() return nil end,createReadyPayload=function() return {peerId=p,transportPeerId=p,instanceId='${instance}',role='edit',placeId=game.PlaceId,placeName='VFX TEST',placeKey='place:'..game.PlaceId,dataModelName=game.Name,isRunning=false,pluginVersion='${manifest.version}',pluginVariant='main',timestamp=tick()} end}`)};
local transport=require(modules.StudioWebSocket);
local fixture={root=root,transport=transport,updates={},ready=false,requests=0}; _G[${lua(key)}]=fixture;
assert(game:GetService('HttpService').HttpEnabled, 'VFX HTTP must be enabled for the native fixture');
fixture.start=function() transport.start({serverUrl='http://127.0.0.1:${port}',registerOnSocket=${baseline ? 'false' : 'true'},onReady=function() fixture.ready=true end,onStatus=function() end,onHeartbeat=function() end,onTransportUpdate=function(u) table.insert(fixture.updates,{state=u.state,detail=u.detail,attempt=u.attempt}) end,dispatchRequest=function(req)
fixture.requests+=1;
if req.endpoint=='/api/place-info' then return {placeId=game.PlaceId,gameId=game.GameId,placeName='VFX TEST'} end;
return {error='Unsupported fixture endpoint'} end}); end;
return {prepared=true};`);
  assert.equal(setup.prepared, true);
  await control(`_G[${lua(key)}].start(); return {started=true}`);
  if (baseline) {
    await delay(22000);
    const state = await control(`local f=_G[${lua(key)}]; return {ready=f.ready,updates=f.updates}`);
    assert.equal(state.ready, false, 'Baseline unexpectedly connected with registration response held');
    assert(heldRegistrations.size > 0, 'The native /ready request must actually reach the fault server');
    assert(Object.values(state.updates).some((update) => update.detail?.includes('/ready registration timed out')), 'Baseline did not reach the expected registration timeout');
    report.events.push({ event: 'baseline_registration_blocked', heldRegistrations: heldRegistrations.size, updates: state.updates });
  } else {
    await waitFor(async () => (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json())).activeWebSockets === 1, 35000, 'fork socket open despite blocked HTTP registration');
    const connected = await toolAt(port, testAuth, 'get_connected_instances', {});
    const target = connected.instances.find((row) => row.placeId === expectedPlace);
    assert(target, 'Fresh VFX target must be present on the isolated bridge');
    const info = await toolAt(port, testAuth, 'get_place_info', { instance_id: target.id });
    assert.equal(info.placeId, expectedPlace);
    assert.equal(heldRegistrations.size, 0, 'Fork must not depend on an HTTP ready request');
    report.events.push({ event: 'fixed_connected_without_http_registration', placeId: info.placeId, heldRegistrations: heldRegistrations.size });
    if (playCycles) {
      await runPlayCycles();
      assert.equal(heldRegistrations.size, 0, 'Play peers must not use HTTP registration');
    }
    else {
      const previousUpgrades = upgrades.length;
      for (const socket of upgradeSockets) socket.destroy();
      await waitFor(async () => upgrades.length > previousUpgrades
        && (await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json())).activeWebSockets === 1,
      35000, 'fork reconnect after isolated server closes its socket');
      assert.equal((await toolAt(port, testAuth, 'get_place_info', { instance_id: target.id })).placeId, expectedPlace);
      assert.equal(heldRegistrations.size, 0);
      report.events.push({ event: 'fixed_reconnected_without_http_registration' });
    }
  }
} finally {
  if (playRequested) {
    try {
      const state = await controller({ kind: 'state' });
      if (!state.editReady && !stopAttempted) { stopAttempted = true; await controller({ kind: 'play', action: 'stop' }); }
      else if (!state.editReady) report.playCleanupPending = true;
    } catch (error) { report.playCleanupPending = true; report.playCleanupError = error.message; }
  }
  if (fixtureCreated) {
    try {
      report.nativeRequestState = await control(`local f=_G[${lua(key)}]; return f and {ready=f.ready,updates=f.updates} or {missing=true}`);
      await control(`local f=_G[${lua(key)}]; if f then f.transport.stop() end; local parent=${fixtureParent}; local r=parent and parent:FindFirstChild(${lua(fixtureName)}); if r then assert(r:GetAttribute('ForkRun')==${lua(runId)}); r:Destroy() end; _G[${lua(key)}]=nil; return {cleaned=true}`);
      report.fixtureCleaned = true;
    } catch (error) { report.fixtureCleaned = false; report.cleanupError = error.message; }
  }
  // Stop the fixture before releasing its stalled registration. Otherwise the
  // old transport can briefly reconnect while cleanup is still being relayed.
  releaseHeld(); clearTimeout(safetyRelease);
  await app.cleanup(); bridge.clearAllPendingRequests();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  report.upgrades = upgrades;
  report.installedPluginAfter = createHash('sha256').update(readFileSync(path.join(process.env.LOCALAPPDATA, 'Roblox/Plugins/MCPPlugin.rbxmx'))).digest('hex');
  report.installationPreserved = report.installedPluginBefore === report.installedPluginAfter;
  mkdirSync(path.join(root, 'local'), { recursive: true });
  writeFileSync(path.join(root, `local/vfx-${report.mode}-${runId}.json`), JSON.stringify(report, null, 2)+'\n');
  writeFileSync(controlRequest, JSON.stringify({ runId, kind: 'complete', fixtureCleaned: report.fixtureCleaned }));
  console.log(JSON.stringify(report, null, 2));
}
assert.equal(report.fixtureCleaned, true, 'VFX fixture must be cleaned');
assert.equal(report.installationPreserved, true, 'Installed plugin must remain unchanged');
