import http from 'node:http';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import request from 'supertest';
import { BridgeService } from '../bridge-service.js';
import { RobloxStudioTools } from '../tools/index.js';
import { createHttpServer, type RobloxStudioHttpApp } from '../http-server.js';

class TestBridge extends BridgeService { protected override notifyPeerRegistered(): void {} }
const metadata = {
  peerId: 'peer:test', transportPeerId: 'peer:test', instanceId: 'instance:test', role: 'edit',
  placeId: 1, placeName: 'VFX TEST', dataModelName: 'Place1', isRunning: false,
  pluginVersion: 'socket-test', pluginVariant: 'main', timestamp: 1,
};

describe('native WebSocket registration after HTTP registration stalls', () => {
  let bridge: TestBridge;
  let app: RobloxStudioHttpApp;
  let server: http.Server;
  let port: number;
  const sockets = new Set<WebSocket>();

  beforeEach(async () => {
    bridge = new TestBridge();
    app = createHttpServer(new RobloxStudioTools(bridge), bridge, undefined,
      { name: 'test', version: metadata.pluginVersion, tools: [] }, { authToken: 'client-secret' });
    server = http.createServer(app);
    app.attachStudioTransport(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as { port: number }).port;
  });
  afterEach(async () => {
    for (const socket of sockets) socket.terminate();
    sockets.clear();
    bridge.clearAllPendingRequests();
    await app.cleanup();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  function connect(body: unknown, headers?: Record<string, string>): WebSocket {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/studio/connect?protocolVersion=1&registration=${encodeURIComponent(JSON.stringify(body))}`, { headers });
    socket.on('error', () => {});
    sockets.add(socket);
    return socket;
  }
  async function rejected(body: unknown, expected: number, headers?: Record<string, string>): Promise<void> {
    const socket = connect(body, headers);
    const status = await new Promise<number>((resolve) => socket.once('unexpected-response', (_req, response) => {
      response.resume(); resolve(response.statusCode!); socket.terminate();
    }));
    expect(status).toBe(expected);
    expect(bridge.getPeers()).toHaveLength(0);
  }

  test('registers, opens and executes without an HTTP ready request or tool-auth exemption', async () => {
    const socket = connect(metadata);
    const [message] = await once(socket, 'message');
    expect(JSON.parse(message.toString())).toMatchObject({ kind: 'ready', success: true, peerId: metadata.peerId, protocolVersion: 1 });
    const health = await request(app).get('/health');
    expect(health.body).toMatchObject({ activeWebSockets: 1, transportConnected: true, connectionState: 'transport_open' });
    await request(app).post('/mcp/get_place_info').send({ instance_id: metadata.instanceId }).expect(401);
    socket.on('message', (frame) => {
      const event = JSON.parse(frame.toString());
      if (event.kind === 'request') socket.send(JSON.stringify({ kind: 'response', requestId: event.requestId, response: { placeId: 1 } }));
    });
    await expect(bridge.sendRequest('/api/place-info', {}, metadata.peerId, 1000)).resolves.toEqual({ placeId: 1 });
    const closed = once(socket, 'close'); socket.close(); await closed;
    expect((await request(app).get('/health')).body).toMatchObject({ activeWebSockets: 0, transportConnected: false, connectionState: 'registered_without_transport' });
  });
  test('rejects a browser origin before admitting registration', async () => {
    await rejected(metadata, 403, { Origin: 'https://untrusted.example' });
  });
  test('contains a registration exception without crashing the upgrade listener', async () => {
    const registration = jest.spyOn(bridge, 'registerPeer').mockImplementation(() => { throw new Error('registration unavailable'); });
    try { await rejected(metadata, 500); }
    finally { registration.mockRestore(); }
    await request(app).get('/health').expect(200);
  });
  test('enforces version parity', async () => { await rejected({ ...metadata, pluginVersion: 'older' }, 426); });
  test('cannot register a client as its own transport', async () => { await rejected({ ...metadata, role: 'client' }, 400); });
  test('cannot use bootstrap to impersonate another transport owner', async () => {
    await rejected({ ...metadata, transportPeerId: 'peer:other' }, 403);
  });
  test('bounds registration metadata and rejects non-record JSON', async () => {
    await rejected({ ...metadata, placeName: 'x'.repeat(4096) }, 400);
    await rejected([], 400);
  });

  async function control(socket: WebSocket, id: number, action: string, data: unknown): Promise<Record<string, unknown>> {
    const requestId = `pc:${id}`;
    const result = new Promise<Record<string, unknown>>((resolve) => {
      const listener = (frame: { toString(): string }) => {
        const event = JSON.parse(frame.toString());
        if (event.kind === 'peer-control-result' && event.requestId === requestId) {
          socket.off('message', listener); resolve(event.result);
        }
      };
      socket.on('message', listener);
    });
    socket.send(JSON.stringify({ kind: 'peer-control', requestId, action, data }));
    return result;
  }
  const serverMetadata = { ...metadata, role: 'server', isRunning: true };
  const clientMetadata = { ...serverMetadata, peerId: 'peer:client', role: 'client' };

  test('registers, targets, refreshes and removes the real client without HTTP /ready', async () => {
    const socket = connect(serverMetadata);
    await once(socket, 'message');
    expect(await control(socket, 1, 'register', clientMetadata)).toMatchObject({ success: true, assignedRole: 'client-1' });
    socket.on('message', frame => {
      const event = JSON.parse(frame.toString());
      if (event.kind === 'request') {
        expect(event.peerId).toBe(clientMetadata.peerId);
        expect(event.target).toBe('client-1');
        socket.send(JSON.stringify({ kind: 'response', requestId: event.requestId, response: { side: 'client' } }));
      }
    });
    await expect(bridge.sendRequest('/api/execute-luau', {}, clientMetadata.peerId, 1000)).resolves.toEqual({ side: 'client' });
    expect(await control(socket, 2, 'register', clientMetadata)).toMatchObject({ success: true, assignedRole: 'client-1' });
    expect(bridge.getPeers()).toHaveLength(2);
    expect(await control(socket, 3, 'register', { ...serverMetadata, placeName: 'renamed' })).toMatchObject({ success: true });
    expect(bridge.getPeerById(metadata.peerId)?.placeName).toBe('renamed');
    expect(await control(socket, 4, 'unregister', { peerId: clientMetadata.peerId })).toEqual({ success: true });
    expect(bridge.getPeers()).toHaveLength(1);
  });

  test('re-registers clients after a replacement transport and rejects cross-owner control', async () => {
    const socket = connect(serverMetadata); await once(socket, 'message');
    expect(await control(socket, 1, 'register', clientMetadata)).toMatchObject({ success: true });
    const other = connect({ ...serverMetadata, peerId: 'peer:other', transportPeerId: 'peer:other', instanceId: 'instance:other' });
    await once(other, 'message');
    expect(await control(other, 1, 'register', { ...clientMetadata, transportPeerId: 'peer:other', instanceId: 'instance:other' })).toMatchObject({ success: false });
    expect(await control(other, 2, 'unregister', { peerId: clientMetadata.peerId })).toMatchObject({ success: false });
    expect(bridge.getPeerById(clientMetadata.peerId)?.transportPeerId).toBe(metadata.peerId);
    const replacement = connect(serverMetadata); await once(replacement, 'message');
    expect(await control(replacement, 1, 'register', clientMetadata)).toMatchObject({ success: true, assignedRole: 'client-1' });
    expect(await control(replacement, 2, 'register', { ...clientMetadata, instanceId: 'instance:other' })).toMatchObject({ success: false, error: 'transport_peer_unavailable' });
    expect(await control(replacement, 3, 'register', { ...clientMetadata, pluginVersion: 'older' })).toMatchObject({ success: false, error: 'plugin_version_mismatch' });
  });

  test('edit transport cannot publish clients and oversized control is bounded', async () => {
    const socket = connect(metadata); await once(socket, 'message');
    expect(await control(socket, 1, 'register', clientMetadata)).toMatchObject({ success: false });
    const closed = once(socket, 'close');
    socket.send(JSON.stringify({ kind: 'peer-control', requestId: 'pc:2', action: 'register', data: { ...metadata, placeName: 'x'.repeat(8192) } }));
    const [code] = await closed;
    expect(code).toBe(1008);
  });
});
