import { beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import { createWorktree } from './git.js';

function gitError(message: string): Error & { stderr: string; code: number } {
  const error = new Error(`Command failed: git\n${message}`) as Error & {
    stderr: string;
    code: number;
  };
  error.stderr = message;
  error.code = 128;
  return error;
}

describe('createWorktree', () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it('falls back to existing branch when -b reports branch already exists', async () => {
    execFileMock
      .mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: (...cbArgs: unknown[]) => void) => {
          cb(gitError("fatal: a branch named 'task/demo' already exists\n"), '', '');
        },
      )
      .mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: (...cbArgs: unknown[]) => void) => {
          cb(null, '', '');
        },
      );

    await expect(createWorktree('/repo', 'task/demo', [])).resolves.toEqual({
      path: '/repo/.worktrees/task/demo',
      branch: 'task/demo',
    });

    expect(execFileMock).toHaveBeenNthCalledWith(
      1,
      'git',
      ['worktree', 'add', '-b', 'task/demo', '/repo/.worktrees/task/demo'],
      { cwd: '/repo' },
      expect.any(Function),
    );
    expect(execFileMock).toHaveBeenNthCalledWith(
      2,
      'git',
      ['worktree', 'add', '/repo/.worktrees/task/demo', 'task/demo'],
      { cwd: '/repo' },
      expect.any(Function),
    );
  });

  it('does not fall back when -b fails for a non-recoverable branch-name error', async () => {
    execFileMock
      .mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: (...cbArgs: unknown[]) => void) => {
          cb(gitError("fatal: 'task/' is not a valid branch name\n"), '', '');
        },
      )
      .mockImplementationOnce(
        (_cmd: string, _args: string[], _opts: unknown, cb: (...cbArgs: unknown[]) => void) => {
          cb(gitError('fatal: invalid reference: task/\n'), '', '');
        },
      );

    await expect(createWorktree('/repo', 'task/', [])).rejects.toThrow(
      "fatal: 'task/' is not a valid branch name",
    );
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });
});
