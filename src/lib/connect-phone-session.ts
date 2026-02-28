export interface CloseConnectPhoneDeps {
  stopPolling: () => void;
  isRemoteAccessEnabled: boolean;
  stopRemoteAccess: () => Promise<void>;
  setQrDataUrl: (value: string | null) => void;
  onClose: () => void;
}

export async function closeConnectPhoneModal(deps: CloseConnectPhoneDeps): Promise<void> {
  deps.stopPolling();
  deps.setQrDataUrl(null);
  deps.onClose();
}

export async function disconnectConnectPhoneModal(deps: CloseConnectPhoneDeps): Promise<void> {
  deps.stopPolling();
  if (deps.isRemoteAccessEnabled) {
    await deps.stopRemoteAccess();
  }
  deps.setQrDataUrl(null);
  deps.onClose();
}
