import { describe, it, expect } from 'vitest';
import {
  parseSlashQuery,
  filterSlashCommands,
  applySlashCompletion,
  type SlashQueryState,
} from './slash-commands';
import type { SlashCommand } from '../store/types';

const commands: SlashCommand[] = [
  {
    id: '1',
    name: '/help',
    description: 'Show help',
    source: 'built-in',
  },
  {
    id: '2',
    name: '/review',
    description: 'Run code review',
    source: 'built-in',
  },
  {
    id: '3',
    name: '/hello-world',
    description: 'Sample custom command',
    source: 'custom',
  },
];

describe('parseSlashQuery', () => {
  it('activates when first token starts with slash', () => {
    const state = parseSlashQuery('/he', 3);
    expect(state.active).toBe(true);
    expect(state.query).toBe('he');
    expect(state.replaceStart).toBe(0);
    expect(state.replaceEnd).toBe(3);
  });

  it('does not activate for non-slash first token', () => {
    const state = parseSlashQuery('hello /he', 9);
    expect(state.active).toBe(false);
  });

  it('does not activate outside first token', () => {
    const state = parseSlashQuery('/help details', 8);
    expect(state.active).toBe(false);
  });

  it('does not activate when caret is beyond first line', () => {
    const state = parseSlashQuery('/help\nnext', 7);
    expect(state.active).toBe(false);
  });
});

describe('filterSlashCommands', () => {
  it('prefers prefix matches', () => {
    const result = filterSlashCommands(commands, 'he');
    expect(result[0]?.name).toBe('/hello-world');
  });

  it('returns all commands for empty query', () => {
    const result = filterSlashCommands(commands, '');
    expect(result).toHaveLength(3);
  });

  it('matches descriptions too', () => {
    const result = filterSlashCommands(commands, 'code');
    expect(result.map((c) => c.name)).toContain('/review');
  });
});

describe('applySlashCompletion', () => {
  it('replaces the first token and keeps suffix', () => {
    const state: SlashQueryState = {
      active: true,
      query: 'he',
      replaceStart: 0,
      replaceEnd: 3,
    };

    const result = applySlashCompletion('/he /ignored', commands[0], state);
    expect(result.text).toBe('/help /ignored');
  });

  it('uses template when provided', () => {
    const command: SlashCommand = {
      id: 'x',
      name: '/review',
      description: 'Run review',
      template: '/review-pr ',
      source: 'custom',
    };

    const state: SlashQueryState = {
      active: true,
      query: 're',
      replaceStart: 0,
      replaceEnd: 3,
    };

    const result = applySlashCompletion('/re', command, state);
    expect(result.text.startsWith('/review-pr')).toBe(true);
    expect(result.caret).toBeGreaterThan(0);
  });
});
