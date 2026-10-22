import { BridgeService } from '../bridge-service.js';
import { RobloxStudioTools } from './test-tools.js';

const EDIT = { peerId: 'edit-native', transportPeerId: 'edit-native', instanceId: 'instance:native-test',
  role: 'edit', placeId: 0, placeName: 'Test', dataModelName: 'Test', isRunning: false };
const PENDING = { success: false, error: 'Playtest teardown did not complete.', stopSignalAccepted: true,
  teardownPending: true, timedOut: true, editModeReady: false, playtestTaskPending: true };

describe('solo playtest native teardown observation', () => {
  test('waits for both native readiness and execution completion after runtime peers disappear', async () => {
    const bridge = new BridgeService();
    bridge.registerPeer(EDIT);
    bridge.registerPeer({ ...EDIT, peerId: 'other-edit', transportPeerId: 'other-edit', instanceId: 'instance:other-test' });
    const states = [
      { editModeReady: false, playtestTaskPending: false },
      { editModeReady: true, playtestTaskPending: true },
      { editModeReady: true, playtestTaskPending: false },
    ];
    const request = jest.spyOn(bridge, 'sendRequest').mockImplementation(async (endpoint) => {
      if (endpoint === '/api/stop-playtest') return PENDING;
      expect(endpoint).toBe('/api/playtest-state');
      return states.shift();
    });
    const result = await new RobloxStudioTools(bridge).soloPlaytest('stop', undefined, 5, EDIT.instanceId);
    expect(JSON.parse(result.content[0].text)).toEqual({ success: true, action: 'stop', message: 'Playtest stopped.' });
    expect(states).toHaveLength(0);
    expect(request.mock.calls.filter(([endpoint]) => endpoint === '/api/stop-playtest')).toHaveLength(1);
    expect(request.mock.calls.every(([, , peer]) => peer === EDIT.peerId)).toBe(true);
  });

  test('keeps pending diagnostics at the deadline even when no runtime peers remain', async () => {
    const bridge = new BridgeService();
    bridge.registerPeer(EDIT);
    const request = jest.spyOn(bridge, 'sendRequest').mockImplementation(async (endpoint) => endpoint === '/api/stop-playtest'
      ? PENDING : { editModeReady: false, playtestTaskPending: false });
    // Exhausted budget: do not infer native readiness from the absence of peers.
    const result = await new RobloxStudioTools(bridge).soloPlaytest('stop', undefined, 0, EDIT.instanceId);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ success: false, action: 'stop', timedOut: true,
      stopSignalAccepted: true, teardownPending: true, editModeReady: false, playtestTaskPending: true });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('never converts an EndTest failure into success by observing an idle Studio', async () => {
    const bridge = new BridgeService();
    bridge.registerPeer(EDIT);
    const failure = { success: false, error: 'EndTest failed', stopSignalAccepted: false };
    const request = jest.spyOn(bridge, 'sendRequest').mockResolvedValue(failure);
    const result = await new RobloxStudioTools(bridge).soloPlaytest('stop', undefined, 1, EDIT.instanceId);
    expect(JSON.parse(result.content[0].text)).toMatchObject(failure);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
