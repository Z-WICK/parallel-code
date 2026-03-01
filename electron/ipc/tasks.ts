import { randomUUID } from 'crypto';
import { createWorktree, removeWorktree } from './git.js';
import { killAgent, notifyAgentListChanged } from './pty.js';

const MAX_SLUG_LEN = 72;
const DEFAULT_TASK_SLUG = 'untitled';
const DEFAULT_BRANCH_PREFIX = 'task';

function slug(name: string): string {
  let result = '';
  let prevWasHyphen = false;
  for (const c of name.toLowerCase()) {
    if (result.length >= MAX_SLUG_LEN) break;
    if (/[a-z0-9]/.test(c)) {
      result += c;
      prevWasHyphen = false;
    } else if (!prevWasHyphen) {
      result += '-';
      prevWasHyphen = true;
    }
  }
  return result.replace(/^-+|-+$/g, '');
}

function sanitizeBranchPrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  const parts = normalized
    .split('/')
    .map(slug)
    .filter((p) => p.length > 0);
  return parts.length === 0 ? DEFAULT_BRANCH_PREFIX : parts.join('/');
}

function ensureBranchNameHasLeaf(rawBranchName: string): string {
  const normalized = rawBranchName.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  const parts = normalized.split('/').filter((p) => p.length > 0);
  if (parts.length === 0) return `${DEFAULT_BRANCH_PREFIX}/${DEFAULT_TASK_SLUG}`;
  if (parts.length === 1) return `${parts[0]}/${DEFAULT_TASK_SLUG}`;
  return parts.join('/');
}

export async function createTask(
  name: string,
  projectRoot: string,
  symlinkDirs: string[],
  branchPrefix: string,
): Promise<{ id: string; branch_name: string; worktree_path: string }> {
  const prefix = sanitizeBranchPrefix(branchPrefix);
  const branchLeaf = slug(name) || DEFAULT_TASK_SLUG;
  const branchName = ensureBranchNameHasLeaf(`${prefix}/${branchLeaf}`);
  const worktree = await createWorktree(projectRoot, branchName, symlinkDirs);
  return {
    id: randomUUID(),
    branch_name: worktree.branch,
    worktree_path: worktree.path,
  };
}

export async function deleteTask(
  agentIds: string[],
  branchName: string,
  deleteBranch: boolean,
  projectRoot: string,
): Promise<void> {
  for (const agentId of agentIds) {
    try {
      killAgent(agentId);
    } catch {
      /* already dead */
    }
  }
  await removeWorktree(projectRoot, branchName, deleteBranch);
  notifyAgentListChanged();
}
