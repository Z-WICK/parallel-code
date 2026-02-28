import { describe, expect, it, vi } from 'vitest';
import {
  closeConnectPhoneModal,
  disconnectConnectPhoneModal,
  type CloseConnectPhoneDeps,
} from './connect-phone-session';

function createDeps(overrides: Partial<CloseConnectPhoneDeps> = {}): CloseConnectPhoneDeps {
  return {
    stopPolling: vi.fn(),
    isRemoteAccessEnabled: true,
    stopRemoteAccess: vi.fn().mockResolvedValue(undefined),
    setQrDataUrl: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('connect phone modal session behavior', () => {
  it('close action does not stop remote access', async () => {
    const deps = createDeps();

    await closeConnectPhoneModal(deps);

    expect(deps.stopPolling).toHaveBeenCalledTimes(1);
    expect(deps.stopRemoteAccess).not.toHaveBeenCalled();
    expect(deps.setQrDataUrl).toHaveBeenCalledWith(null);
    expect(deps.onClose).toHaveBeenCalledTimes(1);
  });

  it('disconnect action stops remote access when enabled', async () => {
    const deps = createDeps({ isRemoteAccessEnabled: true });

    await disconnectConnectPhoneModal(deps);

    expect(deps.stopPolling).toHaveBeenCalledTimes(1);
    expect(deps.stopRemoteAccess).toHaveBeenCalledTimes(1);
    expect(deps.setQrDataUrl).toHaveBeenCalledWith(null);
    expect(deps.onClose).toHaveBeenCalledTimes(1);
  });

  it('disconnect action skips remote stop when already disabled', async () => {
    const deps = createDeps({ isRemoteAccessEnabled: false });

    await disconnectConnectPhoneModal(deps);

    expect(deps.stopPolling).toHaveBeenCalledTimes(1);
    expect(deps.stopRemoteAccess).not.toHaveBeenCalled();
    expect(deps.setQrDataUrl).toHaveBeenCalledWith(null);
    expect(deps.onClose).toHaveBeenCalledTimes(1);
  });
});
