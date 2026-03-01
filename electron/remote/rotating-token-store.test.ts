import { describe, expect, it } from 'vitest';
import { createRotatingTokenStore } from './rotating-token-store.js';

describe('createRotatingTokenStore', () => {
  it('accepts current token and rejects unrelated token', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRotatingTokenStore({
      tokenTtlMs: 1_000,
      previousTokenTtlMs: 10_000,
      maxPreviousTokens: 10,
      now: () => now,
      issueToken: () => `token-${idx++}`,
    });

    expect(store.accepts(store.token)).toBe(true);
    expect(store.accepts('other-token')).toBe(false);

    now += 500;
    expect(store.accepts(store.token)).toBe(true);
  });

  it('accepts prior token after rotation within grace window', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRotatingTokenStore({
      tokenTtlMs: 100,
      previousTokenTtlMs: 1_000,
      maxPreviousTokens: 10,
      now: () => now,
      issueToken: () => `token-${idx++}`,
    });

    const first = store.token;
    now += 150;
    store.rotate();
    const second = store.token;

    expect(first).not.toBe(second);
    expect(store.accepts(first)).toBe(true);
    expect(store.accepts(second)).toBe(true);
  });

  it('drops expired prior tokens after prune', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRotatingTokenStore({
      tokenTtlMs: 100,
      previousTokenTtlMs: 500,
      maxPreviousTokens: 10,
      now: () => now,
      issueToken: () => `token-${idx++}`,
    });

    const first = store.token;
    now += 150;
    store.rotate();
    expect(store.accepts(first)).toBe(true);

    now += 600;
    store.prune();
    expect(store.previousTokenCount()).toBe(0);
    expect(store.accepts(first)).toBe(false);
  });

  it('respects maximum prior-token cap', () => {
    let now = 1_000;
    let idx = 0;
    const store = createRotatingTokenStore({
      tokenTtlMs: 10,
      previousTokenTtlMs: 10_000,
      maxPreviousTokens: 2,
      now: () => now,
      issueToken: () => `token-${idx++}`,
    });

    const first = store.token;
    now += 20;
    store.rotate(); // keeps first
    const second = store.token;
    now += 20;
    store.rotate(); // keeps first, second
    const third = store.token;
    now += 20;
    store.rotate(); // cap=2 => drops first

    expect(store.accepts(first)).toBe(false);
    expect(store.accepts(second)).toBe(true);
    expect(store.accepts(third)).toBe(true);
    expect(store.previousTokenCount()).toBe(2);
  });
});
