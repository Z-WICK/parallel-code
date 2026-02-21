// electron/remote/server.ts

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, createReadStream } from "fs";
import { join, resolve, relative, extname, isAbsolute } from "path";
import { WebSocketServer, WebSocket } from "ws";
import { randomBytes, timingSafeEqual } from "crypto";
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
  const ips = getNetworkIps();
  const authState: {
    current: { token: string; tokenBuf: Buffer; expiresAt: number };
    previous: { tokenBuf: Buffer; graceUntil: number } | null;
  } = {
    current: {
      token: "",
      tokenBuf: Buffer.alloc(0),
      expiresAt: 0,
    },
    previous: null,
  };

  function issueToken(): { token: string; tokenBuf: Buffer; expiresAt: number } {
    const token = randomBytes(24).toString("base64url");
    return {
      token,
      tokenBuf: Buffer.from(token),
      expiresAt: Date.now() + TOKEN_TTL_MS,
    };
  }
  authState.current = issueToken();

  function safeCompare(candidate: string | null | undefined): boolean {
    if (!candidate) return false;
    const now = Date.now();
    const buf = Buffer.from(candidate);
    if (
      now <= authState.current.expiresAt &&
      buf.length === authState.current.tokenBuf.length &&
      timingSafeEqual(buf, authState.current.tokenBuf)
    ) {
      return true;
    }
    if (
      authState.previous &&
      now <= authState.previous.graceUntil &&
      buf.length === authState.previous.tokenBuf.length &&
      timingSafeEqual(buf, authState.previous.tokenBuf)
    ) {
      return true;
    }
    return false;
  }

  function checkAuthHeader(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    return auth?.startsWith("Bearer ") ? safeCompare(auth.slice(7)) : false;
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

  function currentUrls(): { url: string; wifiUrl: string | null; tailscaleUrl: string | null } {
    const localUrl = `http://127.0.0.1:${opts.port}/#token=${authState.current.token}`;
    const primaryIp = opts.allowExternal ? (ips.wifi ?? ips.tailscale ?? "127.0.0.1") : "127.0.0.1";
    const url = `http://${primaryIp}:${opts.port}/#token=${authState.current.token}`;
    const wifiUrl = opts.allowExternal && ips.wifi ? `http://${ips.wifi}:${opts.port}/#token=${authState.current.token}` : null;
    const tailscaleUrl = opts.allowExternal && ips.tailscale ? `http://${ips.tailscale}:${opts.port}/#token=${authState.current.token}` : null;
    return { url: opts.allowExternal ? url : localUrl, wifiUrl, tailscaleUrl };
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // --- API routes (require auth) ---
    if (url.pathname.startsWith("/api/")) {
      if (!checkAuthHeader(req)) {
        res.writeHead(401, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      if (url.pathname === "/api/agents" && req.method === "GET") {
        const list = buildAgentList(opts.getTaskName, opts.getAgentStatus);
        res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
        res.end(JSON.stringify(list));
        return;
      }

      const agentMatch = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
      if (agentMatch && req.method === "GET") {
        const agentId = agentMatch[1];
        const scrollback = getAgentScrollback(agentId);
        if (scrollback === null) {
          res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "agent not found" }));
          return;
        }
        const meta = getAgentMeta(agentId);
        const info = meta ? opts.getAgentStatus(agentId) : null;
        res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
        res.end(JSON.stringify({ agentId, scrollback, status: info?.status ?? "exited", exitCode: info?.exitCode ?? null }));
        return;
      }

      res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
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
      if (!safeCompare(getWsHandshakeToken(info.req))) {
        cb(false, 401, "Unauthorized");
        return;
      }
      cb(true);
    },
  });

  const authedClients = new Set<WebSocket>();

  function rotateToken(): void {
    const oldTokenBuf = authState.current.tokenBuf;
    authState.current = issueToken();
    authState.previous = {
      tokenBuf: oldTokenBuf,
      graceUntil: Date.now() + TOKEN_GRACE_MS,
    };

    const urls = currentUrls();
    const tokenMessage = JSON.stringify({
      type: "token",
      token: authState.current.token,
      tokenExpiresAt: authState.current.expiresAt,
      url: urls.url,
      wifiUrl: urls.wifiUrl,
      tailscaleUrl: urls.tailscaleUrl,
    } satisfies ServerMessage);

    for (const client of authedClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(tokenMessage);
      }
    }
  }

  const tokenExpiryTimer = setInterval(() => {
    const now = Date.now();
    if (now > authState.current.expiresAt) {
      rotateToken();
    }
    if (authState.previous && now > authState.previous.graceUntil) {
      authState.previous = null;
    }
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
    let authed = safeCompare(getWsHandshakeToken(req));
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
    }

    clientSubs.set(ws, new Map());

    ws.on("message", (raw) => {
      const msg = parseClientMessage(String(raw));
      if (!msg) return;
      if (!authed) {
        if (msg.type !== "auth" || !safeCompare(msg.token)) {
          ws.close(4001, "Unauthorized");
          return;
        }
        authed = true;
        authedClients.add(ws);
        clearTimeout(authTimeout);
        sendAgentList();
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
    get token() { return authState.current.token; },
    get tokenExpiresAt() { return authState.current.expiresAt; },
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
