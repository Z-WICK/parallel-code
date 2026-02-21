import { setStore } from "./core";
import { invoke } from "../lib/ipc";
import { IPC } from "../../electron/ipc/channels";

interface ServerResult {
  url: string;
  wifiUrl: string | null;
  tailscaleUrl: string | null;
  token: string;
  tokenExpiresAt: number;
  port: number;
}

interface StartRemoteAccessOptions {
  port?: number;
  allowExternal?: boolean;
}

// Generation counter — incremented on stop so in-flight poll responses
// that arrive after stop are discarded instead of overwriting the store.
let stopGeneration = 0;

export async function startRemoteAccess(options: StartRemoteAccessOptions = {}): Promise<ServerResult> {
  const result = await invoke<ServerResult>(
    IPC.StartRemoteServer,
    {
      ...(options.port ? { port: options.port } : {}),
      ...(options.allowExternal !== undefined ? { allowExternal: options.allowExternal } : {}),
    }
  );
  setStore("remoteAccess", {
    enabled: true,
    token: result.token,
    tokenExpiresAt: result.tokenExpiresAt,
    port: result.port,
    url: result.url,
    wifiUrl: result.wifiUrl,
    tailscaleUrl: result.tailscaleUrl,
    connectedClients: 0,
  });
  return result;
}

export async function stopRemoteAccess(): Promise<void> {
  stopGeneration++;
  await invoke(IPC.StopRemoteServer);
  setStore("remoteAccess", {
    enabled: false,
    token: null,
    tokenExpiresAt: null,
    port: 7777,
    url: null,
    wifiUrl: null,
    tailscaleUrl: null,
    connectedClients: 0,
  });
}

export async function refreshRemoteStatus(): Promise<void> {
  const gen = stopGeneration;
  const result = await invoke<{
    enabled: boolean;
    connectedClients: number;
    url?: string;
    wifiUrl?: string;
    tailscaleUrl?: string;
    token?: string;
    tokenExpiresAt?: number;
    port?: number;
  }>(IPC.GetRemoteStatus);

  // Discard stale response if stopRemoteAccess was called while in-flight
  if (gen !== stopGeneration) return;

  if (result.enabled) {
    setStore("remoteAccess", {
      enabled: true,
      connectedClients: result.connectedClients,
      url: result.url ?? null,
      wifiUrl: result.wifiUrl ?? null,
      tailscaleUrl: result.tailscaleUrl ?? null,
      token: result.token ?? null,
      tokenExpiresAt: result.tokenExpiresAt ?? null,
      port: result.port ?? 7777,
    });
  } else {
    setStore("remoteAccess", "enabled", false);
    setStore("remoteAccess", "tokenExpiresAt", null);
    setStore("remoteAccess", "connectedClients", 0);
  }
}
