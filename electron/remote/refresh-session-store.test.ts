import { describe, expect, it } from 'vitest';
import { createRefreshSessionStore } from './refresh-session-store.js';

describe('createRefreshSessionStore', () => {
  it('issues token and exchanges it one-time', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRefreshSessionStore({
      ttlMs: 10_000,
      maxTokens: 10,
      now: () => now,
      issueToken: () => `refresh-${idx++}`,
    });

    const first = store.issue();
    expect(first).toBe('refresh-0');
    expect(store.count()).toBe(1);

    const second = store.exchange(first);
    expect(second).toBe('refresh-1');
    expect(store.count()).toBe(1);

    // Old token is consumed.
    expect(store.exchange(first)).toBeNull();
    // New token works.
    expect(store.exchange(second)).toBe('refresh-2');
  });

  it('rejects expired refresh token', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRefreshSessionStore({
      ttlMs: 100,
      maxTokens: 10,
      now: () => now,
      issueToken: () => `refresh-${idx++}`,
    });

    const token = store.issue();
    now += 200;
    store.prune();
    expect(store.count()).toBe(0);
    expect(store.exchange(token)).toBeNull();
  });

  it('caps token count to maxTokens', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRefreshSessionStore({
      ttlMs: 10_000,
      maxTokens: 2,
      now: () => now,
      issueToken: () => `refresh-${idx++}`,
    });

    const t0 = store.issue();
    const t1 = store.issue();
    const t2 = store.issue();

    expect(store.count()).toBe(2);
    // Oldest should be dropped.
    expect(store.exchange(t0)).toBeNull();
    expect(store.exchange(t1)).not.toBeNull();
    expect(store.exchange(t2)).not.toBeNull();
  });
});
