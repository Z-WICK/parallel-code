import { beforeEach, describe, expect, it, vi } from 'vitest';

const createWorktreeMock = vi.hoisted(() => vi.fn());

vi.mock('./git.js', () => ({
  createWorktree: createWorktreeMock,
  removeWorktree: vi.fn(),
}));

vi.mock('./pty.js', () => ({
  killAgent: vi.fn(),
  notifyAgentListChanged: vi.fn(),
}));

import { createTask } from './tasks.js';

describe('createTask', () => {
  beforeEach(() => {
    createWorktreeMock.mockReset();
    createWorktreeMock.mockResolvedValue({
      path: '/repo/.worktrees/task/untitled',
      branch: 'task/untitled',
    });
  });

  it('uses "untitled" when task name slug is empty', async () => {
    await createTask('你好 世界', '/repo', [], 'task');

    expect(createWorktreeMock).toHaveBeenCalledWith('/repo', 'task/untitled', []);
  });

  it('sanitizes branch prefix and task name', async () => {
    await createTask('Fix Login Bug', '/repo', [], 'Feature//Team Name');

    expect(createWorktreeMock).toHaveBeenCalledWith('/repo', 'feature/team-name/fix-login-bug', []);
  });
});
