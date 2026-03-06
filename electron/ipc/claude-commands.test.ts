import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
  default: {
    execFile: execFileMock,
  },
}));

import { listClaudeCommands, parseClaudeHelpCommands } from './claude-commands.js';

describe('parseClaudeHelpCommands', () => {
  it('parses valid slash commands, deduplicates, and sorts', () => {
    const helpText = [
      'Usage: claude [options]',
      '  /plan Create a plan',
      '  /Help Show help',
      '  /plan Duplicate should be ignored',
      '  /invalid*name not allowed',
      '  /mcp:status Show MCP status',
    ].join('\n');

    expect(parseClaudeHelpCommands(helpText)).toEqual([
      {
        id: 'cli-help',
        name: '/Help',
        description: 'Show help',
        source: 'cli',
      },
      {
        id: 'cli-mcp:status',
        name: '/mcp:status',
        description: 'Show MCP status',
        source: 'cli',
      },
      {
        id: 'cli-plan',
        name: '/plan',
        description: 'Create a plan',
        source: 'cli',
      },
    ]);
  });

  it('uses fallback description when missing', () => {
    const helpText = '  /compact';
    expect(parseClaudeHelpCommands(helpText)).toEqual([
      {
        id: 'cli-compact',
        name: '/compact',
        description: 'Claude CLI command',
        source: 'cli',
      },
    ]);
  });

  it('returns empty list for empty input', () => {
    expect(parseClaudeHelpCommands('')).toEqual([]);
  });
});

describe('listClaudeCommands', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('returns parsed commands from claude --help', async () => {
    execFileMock.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(null, '  /help Show help\n  /plan Create plan\n', '');
      },
    );

    await expect(listClaudeCommands()).resolves.toEqual([
      {
        id: 'cli-help',
        name: '/help',
        description: 'Show help',
        source: 'cli',
      },
      {
        id: 'cli-plan',
        name: '/plan',
        description: 'Create plan',
        source: 'cli',
      },
    ]);

    expect(execFileMock).toHaveBeenCalledWith(
      'claude',
      ['--help'],
      expect.objectContaining({ timeout: 3000 }),
      expect.any(Function),
    );
  });

  it('returns empty list when command fails', async () => {
    execFileMock.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error('spawn ENOENT'), '', '');
      },
    );

    await expect(listClaudeCommands()).resolves.toEqual([]);
  });

  it('returns empty list on timeout-like failure', async () => {
    execFileMock.mockImplementationOnce(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (error: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error('Command failed: timeout'), '', '');
      },
    );

    await expect(listClaudeCommands()).resolves.toEqual([]);
  });
});
