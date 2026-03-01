import { randomBytes, timingSafeEqual } from 'crypto';

interface RefreshEntry {
  tokenBuf: Buffer;
  expiresAt: number;
}

interface RefreshSessionStoreOptions {
  ttlMs: number;
  maxTokens: number;
  now?: () => number;
  issueToken?: () => string;
}

export interface RefreshSessionStore {
  issue: () => string;
  exchange: (candidate: string | null | undefined) => string | null;
  prune: () => void;
  count: () => number;
}

function defaultIssueToken(): string {
  return randomBytes(24).toString('base64url');
}

export function createRefreshSessionStore(options: RefreshSessionStoreOptions): RefreshSessionStore {
  const now = options.now ?? Date.now;
  const issueToken = options.issueToken ?? defaultIssueToken;
  const entries: RefreshEntry[] = [];

  function prune(): void {
    const nowMs = now();
    for (let i = entries.length - 1; i >= 0; i--) {
      if (nowMs > entries[i].expiresAt) entries.splice(i, 1);
    }
  }

  function issue(): string {
    prune();
    const token = issueToken();
    entries.push({
      tokenBuf: Buffer.from(token),
      expiresAt: now() + options.ttlMs,
    });
    if (entries.length > options.maxTokens) {
      entries.splice(0, entries.length - options.maxTokens);
    }
    return token;
  }

  function exchange(candidate: string | null | undefined): string | null {
    if (!candidate) return null;
    prune();

    const candidateBuf = Buffer.from(candidate);
    const nowMs = now();
    let foundIdx = -1;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (nowMs > entry.expiresAt) continue;
      if (candidateBuf.length !== entry.tokenBuf.length) continue;
      if (!timingSafeEqual(candidateBuf, entry.tokenBuf)) continue;
      foundIdx = i;
      break;
    }
    if (foundIdx === -1) return null;

    // One-time use: consume old refresh token and issue a replacement.
    entries.splice(foundIdx, 1);
    return issue();
  }

  return {
    issue,
    exchange,
    prune,
    count: () => entries.length,
  };
}
