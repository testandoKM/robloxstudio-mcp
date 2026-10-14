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
});
