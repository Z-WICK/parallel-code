import { randomBytes, timingSafeEqual } from 'crypto';

interface CurrentToken {
  token: string;
  tokenBuf: Buffer;
  expiresAt: number;
}

interface PreviousToken {
  tokenBuf: Buffer;
  expiresAt: number;
}

interface RotatingTokenStoreOptions {
  tokenTtlMs: number;
  previousTokenTtlMs: number;
  maxPreviousTokens: number;
  now?: () => number;
  issueToken?: () => string;
}

export interface RotatingTokenStore {
  readonly token: string;
  readonly tokenExpiresAt: number;
  accepts: (candidate: string | null | undefined) => boolean;
  rotate: () => void;
  prune: () => void;
  previousTokenCount: () => number;
}

function defaultIssueToken(): string {
  return randomBytes(24).toString('base64url');
}

export function createRotatingTokenStore(options: RotatingTokenStoreOptions): RotatingTokenStore {
  const now = options.now ?? Date.now;
  const issueToken = options.issueToken ?? defaultIssueToken;
  const previous: PreviousToken[] = [];

  function issueCurrent(): CurrentToken {
    const token = issueToken();
    return {
      token,
      tokenBuf: Buffer.from(token),
      expiresAt: now() + options.tokenTtlMs,
    };
  }

  let current = issueCurrent();

  function accepts(candidate: string | null | undefined): boolean {
    if (!candidate) return false;
    const candidateBuf = Buffer.from(candidate);
    const nowMs = now();

    if (
      nowMs <= current.expiresAt &&
      candidateBuf.length === current.tokenBuf.length &&
      timingSafeEqual(candidateBuf, current.tokenBuf)
    ) {
      return true;
    }

    for (const prev of previous) {
      if (
        nowMs <= prev.expiresAt &&
        candidateBuf.length === prev.tokenBuf.length &&
        timingSafeEqual(candidateBuf, prev.tokenBuf)
      ) {
        return true;
      }
    }

    return false;
  }

  function rotate(): void {
    previous.push({
      tokenBuf: current.tokenBuf,
      expiresAt: now() + options.previousTokenTtlMs,
    });
    if (previous.length > options.maxPreviousTokens) {
      previous.splice(0, previous.length - options.maxPreviousTokens);
    }
    current = issueCurrent();
  }

  function prune(): void {
    const nowMs = now();
    for (let i = previous.length - 1; i >= 0; i--) {
      if (nowMs > previous[i].expiresAt) previous.splice(i, 1);
    }
  }

  return {
    get token() {
      return current.token;
    },
    get tokenExpiresAt() {
      return current.expiresAt;
    },
    accepts,
    rotate,
    prune,
    previousTokenCount: () => previous.length,
  };
}
