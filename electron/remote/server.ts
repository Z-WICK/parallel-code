// electron/remote/server.ts

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, createReadStream } from "fs";
import { join, resolve, relative, extname, isAbsolute } from "path";
import { WebSocketServer, WebSocket } from "ws";
import { networkInterfaces } from "os";
import {
  writeToAgent,
  resizeAgent,
  killAgent,
  subscribeToAgent,
  unsubscribeFromAgent,
  getAgentScrollback,
  getActiveAgentIds,
  getAgentMeta,
  getAgentCols,
  onPtyEvent,
} from "../ipc/pty.js";
import {
  parseClientMessage,
  type ServerMessage,
  type RemoteAgent,
} from "./protocol.js";
import { createRotatingTokenStore } from "./rotating-token-store.js";
import { createRefreshSessionStore } from "./refresh-session-store.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_CHECK_MS = 5 * 1000;
const TOKEN_GRACE_MS = 60 * 1000;
const MAX_PREVIOUS_TOKENS = 1;
const REFRESH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_REFRESH_TOKENS = 64;

interface RemoteServer {
  stop: () => Promise<void>;
  token: string;
  tokenExpiresAt: number;
  port: number;
  url: string;
  tailscaleUrl: string | null;
  wifiUrl: string | null;
  connectedClients: () => number;
}

/** Detect available network IPs (WiFi and Tailscale). */
function getNetworkIps(): { wifi: string | null; tailscale: string | null } {
  const nets = networkInterfaces();
  let wifi: string | null = null;
  let tailscale: string | null = null;

  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (addr.address.startsWith("100.")) {
        tailscale ??= addr.address;
      } else if (!addr.address.startsWith("172.")) {
        wifi ??= addr.address;
      }
    }
  }

  return { wifi, tailscale };
}

/** Build the agent list, deduplicated by taskId (keeps latest agent per task). */
function buildAgentList(
  getTaskName: (taskId: string) => string,
  getAgentStatus: (agentId: string) => { status: "running" | "exited"; exitCode: number | null; lastLine: string },
): RemoteAgent[] {
  const byTask = new Map<string, RemoteAgent>();
  for (const agentId of getActiveAgentIds()) {
    const meta = getAgentMeta(agentId);
    if (!meta) continue;
    const info = getAgentStatus(agentId);
    const agent: RemoteAgent = {
      agentId,
      taskId: meta.taskId,
      taskName: getTaskName(meta.taskId),
      status: info.status,
      exitCode: info.exitCode,
      lastLine: info.lastLine,
    };
    // Prefer running agents over exited ones for the same task
    const existing = byTask.get(meta.taskId);
    if (!existing || (agent.status === "running" && existing.status !== "running")) {
      byTask.set(meta.taskId, agent);
    }
  }
  return Array.from(byTask.values());
}

export function startRemoteServer(opts: {
  port: number;
  allowExternal: boolean;
  staticDir: string;
  getTaskName: (taskId: string) => string;
  getAgentStatus: (agentId: string) => { status: "running" | "exited"; exitCode: number | null; lastLine: string };
}): RemoteServer {
  const tokenStore = createRotatingTokenStore({
    tokenTtlMs: TOKEN_TTL_MS,
    previousTokenTtlMs: TOKEN_GRACE_MS,
    maxPreviousTokens: MAX_PREVIOUS_TOKENS,
  });
  const refreshStore = createRefreshSessionStore({
    ttlMs: REFRESH_TOKEN_TTL_MS,
    maxTokens: MAX_REFRESH_TOKENS,
  });

  function checkAuthHeader(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    return auth?.startsWith("Bearer ") ? tokenStore.accepts(auth.slice(7)) : false;
  }

  function getWsProtocolToken(req: IncomingMessage): string | null {
    const raw = req.headers["sec-websocket-protocol"];
    if (!raw) return null;
    const value = Array.isArray(raw) ? raw.join(",") : raw;
    const protocols = value
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const protocol of protocols) {
      if (protocol.startsWith("pc-token.")) {
        return protocol.slice("pc-token.".length);
      }
    }
    return null;
  }

  function getWsHandshakeToken(req: IncomingMessage): string | null {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.slice(7);
    const protocolToken = getWsProtocolToken(req);
    if (protocolToken) return protocolToken;
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    return url.searchParams.get("token");
  }

  const SECURITY_HEADERS: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  };

  function writeJson(res: ServerResponse, status: number, payload: unknown): void {
    res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  }

  function issueTokenPayload(includeRefreshToken = false): {
    token: string;
    tokenExpiresAt: number;
    refreshToken?: string;
    url: string;
    wifiUrl: string | null;
    tailscaleUrl: string | null;
  } {
    const urls = currentUrls();
    return {
      token: tokenStore.token,
      tokenExpiresAt: tokenStore.tokenExpiresAt,
      ...(includeRefreshToken ? { refreshToken: refreshStore.issue() } : {}),
      url: urls.url,
      wifiUrl: urls.wifiUrl,
      tailscaleUrl: urls.tailscaleUrl,
    };
  }

  function sendTokenMessage(ws: WebSocket, includeRefreshToken = false): void {
    ws.send(
      JSON.stringify({
        type: "token",
        ...issueTokenPayload(includeRefreshToken),
      } satisfies ServerMessage),
    );
  }

  function currentUrls(): { url: string; wifiUrl: string | null; tailscaleUrl: string | null } {
    // Re-detect interfaces dynamically so newly connected networks (e.g. Tailscale)
    // are reflected without restarting the remote server.
    const ips = getNetworkIps();
    // Use query token in the shared URL to avoid camera-app fragment loss on iOS.
    const localUrl = `http://127.0.0.1:${opts.port}/?token=${tokenStore.token}`;
    const primaryIp = opts.allowExternal ? (ips.wifi ?? ips.tailscale ?? "127.0.0.1") : "127.0.0.1";
    const url = `http://${primaryIp}:${opts.port}/?token=${tokenStore.token}`;
    const wifiUrl = opts.allowExternal && ips.wifi ? `http://${ips.wifi}:${opts.port}/?token=${tokenStore.token}` : null;
    const tailscaleUrl = opts.allowExternal && ips.tailscale ? `http://${ips.tailscale}:${opts.port}/?token=${tokenStore.token}` : null;
    return { url: opts.allowExternal ? url : localUrl, wifiUrl, tailscaleUrl };
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // --- API routes (require auth) ---
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/auth/refresh" && req.method === "POST") {
        let raw = "";
        req.on("data", (chunk: Buffer) => {
          raw += chunk.toString("utf8");
          if (raw.length > 8 * 1024) req.destroy();
        });
        req.on("error", () => {
          writeJson(res, 400, { error: "bad request" });
        });
        req.on("end", () => {
          let refreshToken: string | null = null;
          try {
            const parsed = JSON.parse(raw) as { refreshToken?: unknown };
            refreshToken =
              typeof parsed.refreshToken === "string" ? parsed.refreshToken : null;
          } catch {
            writeJson(res, 400, { error: "invalid json" });
            return;
          }

          const nextRefreshToken = refreshStore.exchange(refreshToken);
          if (!nextRefreshToken) {
            writeJson(res, 401, { error: "unauthorized" });
            return;
          }

          if (Date.now() > tokenStore.tokenExpiresAt) {
            rotateToken();
          }
          const urls = currentUrls();
          writeJson(res, 200, {
            token: tokenStore.token,
            tokenExpiresAt: tokenStore.tokenExpiresAt,
            refreshToken: nextRefreshToken,
            url: urls.url,
            wifiUrl: urls.wifiUrl,
            tailscaleUrl: urls.tailscaleUrl,
          });
        });
        return;
      }

      if (!checkAuthHeader(req)) {
        writeJson(res, 401, { error: "unauthorized" });
        return;
      }

      if (url.pathname === "/api/agents" && req.method === "GET") {
        const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
        writeJson(res, 200, list);
        return;
      }

      const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch && req.method === "GET") {
        const agentId = agentMatch[1];
        const scrollback = getAgentScrollback(agentId);
        if (scrollback === null) {
          writeJson(res, 404, { error: "agent not found" });
          return;
        }
        const meta = getAgentMeta(agentId);
        const info = meta ? opts.getAgentStatus(agentId) : null;
        writeJson(res, 200, {
          agentId,
          scrollback,
          status: info?.status ?? "exited",
          exitCode: info?.exitCode ?? null,
        });
        return;
      }

      writeJson(res, 404, { error: "not found" });
      return;
    }

    // --- Static file serving for mobile SPA (async) ---
    const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const fullPath = resolve(opts.staticDir, filePath.replace(/^\/+/, ""));
    const rel = relative(opts.staticDir, fullPath);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      res.writeHead(400, SECURITY_HEADERS);
      res.end("Bad request");
      return;
    }

    const serveFile = (path: string, ct: string, cc: string) => {
      const stream = createReadStream(path);
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": ct, "Cache-Control": cc });
      stream.pipe(res);
      stream.on("error", () => { if (!res.headersSent) { res.writeHead(500); } res.end(); });
    };

    if (!existsSync(fullPath)) {
      const indexPath = join(opts.staticDir, "index.html");
      if (existsSync(indexPath)) {
        serveFile(indexPath, "text/html", "no-cache");
        return;
      }
      res.writeHead(404, SECURITY_HEADERS);
      res.end("Not found");
      return;
    }

    const ext = extname(fullPath);
    const contentType = MIME[ext] ?? "application/octet-stream";
    const cacheControl = ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable";
    serveFile(fullPath, contentType, cacheControl);
  });

  // --- WebSocket server ---
  const wss = new WebSocketServer({
    server,
    maxPayload: 64 * 1024,
    verifyClient: (info, cb) => {
      const reqUrl = new URL(info.req.url ?? "/", `http://${info.req.headers.host ?? "localhost"}`);
      if (reqUrl.pathname !== "/ws") {
        cb(false, 404, "Not found");
        return;
      }
      if (wss.clients.size >= 10) {
        cb(false, 429, "Too many connections");
        return;
      }
      if (!tokenStore.accepts(getWsHandshakeToken(info.req))) {
        cb(false, 401, "Unauthorized");
        return;
      }
      cb(true);
    },
  });

  const authedClients = new Set<WebSocket>();

  function rotateToken(): void {
    tokenStore.rotate();

    for (const client of authedClients) {
      if (client.readyState === WebSocket.OPEN) {
        sendTokenMessage(client, false);
      }
    }
  }

  const tokenExpiryTimer = setInterval(() => {
    const now = Date.now();
    if (now > tokenStore.tokenExpiresAt) {
      rotateToken();
    }
    tokenStore.prune();
    refreshStore.prune();
  }, TOKEN_EXPIRY_CHECK_MS);

  const clientSubs = new WeakMap<WebSocket, Map<string, (data: string) => void>>();

  function broadcast(msg: ServerMessage): void {
    const json = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  const unsubSpawn = onPtyEvent("spawn", () => {
    const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
    broadcast({ type: "agents", list });
  });

  const unsubListChanged = onPtyEvent("list-changed", () => {
    const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
    broadcast({ type: "agents", list });
  });

  const unsubExit = onPtyEvent("exit", (agentId, data) => {
    const { exitCode } = (data ?? {}) as { exitCode?: number };
    broadcast({ type: "status", agentId, status: "exited", exitCode: exitCode ?? null });
    // Clean stale subscription entries from all connected clients
    for (const client of wss.clients) {
      clientSubs.get(client)?.delete(agentId);
    }
    setTimeout(() => {
      const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
      broadcast({ type: "agents", list });
    }, 100);
  });

  wss.on("connection", (ws, req) => {
    let authed = tokenStore.accepts(getWsHandshakeToken(req));
    const authTimeout = setTimeout(() => {
      if (!authed && ws.readyState === WebSocket.OPEN) {
        ws.close(4001, "Auth timeout");
      }
    }, 10_000);

    function sendAgentList(): void {
      const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
      ws.send(JSON.stringify({ type: "agents", list } satisfies ServerMessage));
    }

    if (authed) {
      authedClients.add(ws);
      clearTimeout(authTimeout);
      sendAgentList();
      sendTokenMessage(ws, true);
    }

    clientSubs.set(ws, new Map());

    ws.on("message", (raw) => {
      const msg = parseClientMessage(String(raw));
      if (!msg) return;
      if (!authed) {
        if (msg.type !== "auth" || !tokenStore.accepts(msg.token)) {
          ws.close(4001, "Unauthorized");
          return;
        }
        authed = true;
        authedClients.add(ws);
        clearTimeout(authTimeout);
        sendAgentList();
        sendTokenMessage(ws, true);
        return;
      }

      switch (msg.type) {
        case "auth":
          // Ignore duplicate auth frames after a client is authenticated.
          break;
        case "input":
          try { writeToAgent(msg.agentId, msg.data); } catch { /* agent gone */ }
          break;

        case "resize":
          try { resizeAgent(msg.agentId, msg.cols, msg.rows); } catch { /* agent gone */ }
          break;

        case "kill":
          try { killAgent(msg.agentId); } catch { /* agent gone */ }
          break;

        case "subscribe": {
          const subs = clientSubs.get(ws);
          if (subs?.has(msg.agentId)) break;

          const scrollback = getAgentScrollback(msg.agentId);
          if (scrollback) {
            ws.send(JSON.stringify({ type: "scrollback", agentId: msg.agentId, data: scrollback, cols: getAgentCols(msg.agentId) } satisfies ServerMessage));
          }

          const cb = (encoded: string) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "output", agentId: msg.agentId, data: encoded } satisfies ServerMessage));
            }
          };
          if (subscribeToAgent(msg.agentId, cb)) {
            subs?.set(msg.agentId, cb);
          }
          break;
        }

        case "unsubscribe": {
          const subs = clientSubs.get(ws);
          const cb = subs?.get(msg.agentId);
          if (cb) {
            unsubscribeFromAgent(msg.agentId, cb);
            subs?.delete(msg.agentId);
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      authedClients.delete(ws);
      clearTimeout(authTimeout);
      const subs = clientSubs.get(ws);
      if (subs) {
        for (const [agentId, cb] of subs) {
          unsubscribeFromAgent(agentId, cb);
        }
      }
    });
  });

  server.on("error", (err) => {
    console.error("[remote] Server error:", err.message);
  });
  const bindHost = opts.allowExternal ? "0.0.0.0" : "127.0.0.1";
  server.listen(opts.port, bindHost);

  return {
    get token() { return tokenStore.token; },
    get tokenExpiresAt() { return tokenStore.tokenExpiresAt; },
    port: opts.port,
    get url() { return currentUrls().url; },
    get wifiUrl() { return currentUrls().wifiUrl; },
    get tailscaleUrl() { return currentUrls().tailscaleUrl; },
    connectedClients: () => wss.clients.size,
    stop: () => new Promise<void>((resolve) => {
      unsubSpawn();
      unsubExit();
      unsubListChanged();
      clearInterval(tokenExpiryTimer);
      for (const client of wss.clients) client.close();
      authedClients.clear();
      wss.close();
      server.close(() => resolve());
    }),
  };
}
