import { Show, For, createSignal, createResource, createEffect } from 'solid-js';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { store, closeTask, mergeTask, pushTask, getProject } from '../store/store';
import { sendPrompt } from '../store/tasks';
import { ConfirmDialog } from './ConfirmDialog';
import { ChangedFilesList } from './ChangedFilesList';
import { DiffViewerDialog } from './DiffViewerDialog';
import { theme } from '../lib/theme';
import { localize } from '../lib/i18n';
import type { Task } from '../store/types';
import type { ChangedFile, MergeStatus, WorktreeStatus } from '../ipc/types';

interface TaskDialogsProps {
  task: Task;
  showCloseConfirm: boolean;
  onCloseConfirmDone: () => void;
  showMergeConfirm: boolean;
  initialCleanup: boolean;
  onMergeConfirmDone: () => void;
  showPushConfirm: boolean;
  onPushStart: () => void;
  onPushConfirmDone: (success: boolean) => void;
  diffFile: ChangedFile | null;
  onDiffClose: () => void;
  onDiffFileClick: (file: ChangedFile) => void;
}

export function TaskDialogs(props: TaskDialogsProps) {
  const t = (english: string, chinese: string) => localize(store.locale, english, chinese);
  // --- Merge state ---
  const [mergeError, setMergeError] = createSignal('');
  const [merging, setMerging] = createSignal(false);
  const [squash, setSquash] = createSignal(false);
  const [cleanupAfterMerge, setCleanupAfterMerge] = createSignal(false);
  const [squashMessage, setSquashMessage] = createSignal('');
  const [rebasing, setRebasing] = createSignal(false);
  const [rebaseError, setRebaseError] = createSignal('');
  const [rebaseSuccess, setRebaseSuccess] = createSignal(false);

  // --- Push state ---
  const [pushError, setPushError] = createSignal('');
  const [pushing, setPushing] = createSignal(false);

  // --- Resources ---
  const [branchLog] = createResource(
    () => (props.showMergeConfirm ? props.task.worktreePath : null),
    (path) => invoke<string>(IPC.GetBranchLog, { worktreePath: path }),
  );
  const [worktreeStatus] = createResource(
    () =>
      props.showMergeConfirm || (props.showCloseConfirm && !props.task.directMode)
        ? props.task.worktreePath
        : null,
    (path) => invoke<WorktreeStatus>(IPC.GetWorktreeStatus, { worktreePath: path }),
  );
  const [mergeStatus, { refetch: refetchMergeStatus }] = createResource(
    () => (props.showMergeConfirm ? props.task.worktreePath : null),
    (path) => invoke<MergeStatus>(IPC.CheckMergeStatus, { worktreePath: path }),
  );

  const hasConflicts = () => (mergeStatus()?.conflicting_files.length ?? 0) > 0;
  const hasCommittedChangesToMerge = () => worktreeStatus()?.has_committed_changes ?? false;

  // Reset all merge-related state when the dialog opens
  createEffect(() => {
    if (props.showMergeConfirm) {
      setCleanupAfterMerge(props.initialCleanup);
      setSquash(false);
      setSquashMessage('');
      setMergeError('');
      setRebaseError('');
      setRebaseSuccess(false);
      setMerging(false);
      setRebasing(false);
    }
  });

  return (
    <>
      {/* Close Task Dialog */}
      <ConfirmDialog
        open={props.showCloseConfirm}
        title={t('Close Task', '关闭任务')}
        message={
          <div>
            <Show when={props.task.directMode}>
              <p style={{ margin: '0' }}>
                {t(
                  'This will stop all running agents and shells for this task. No git operations will be performed.',
                  '这会停止该任务下所有运行中的代理和终端，不会执行任何 Git 操作。',
                )}
              </p>
            </Show>
            <Show when={!props.task.directMode}>
              <Show
                when={
                  worktreeStatus()?.has_uncommitted_changes ||
                  worktreeStatus()?.has_committed_changes
                }
              >
                <div
                  style={{
                    'margin-bottom': '12px',
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '8px',
                  }}
                >
                  <Show when={worktreeStatus()?.has_uncommitted_changes}>
                    <div
                      style={{
                        'font-size': '12px',
                        color: theme.warning,
                        background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                        padding: '8px 12px',
                        'border-radius': '8px',
                        border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                        'font-weight': '600',
                      }}
                    >
                      {t(
                        'Warning: There are uncommitted changes that will be permanently lost.',
                        '警告：存在未提交修改，关闭后将永久丢失。',
                      )}
                    </div>
                  </Show>
                  <Show when={worktreeStatus()?.has_committed_changes}>
                    <div
                      style={{
                        'font-size': '12px',
                        color: theme.warning,
                        background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                        padding: '8px 12px',
                        'border-radius': '8px',
                        border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                        'font-weight': '600',
                      }}
                    >
                      {t(
                        'Warning: This branch has commits that have not been merged into main.',
                        '警告：该分支包含尚未合并到主分支的提交。',
                      )}
                    </div>
                  </Show>
                </div>
              </Show>
              {(() => {
                const project = getProject(props.task.projectId);
                const willDeleteBranch = project?.deleteBranchOnClose ?? true;
                return (
                  <>
                    <p style={{ margin: '0 0 8px' }}>
                      {willDeleteBranch
                        ? t(
                            'This action cannot be undone. The following will be permanently deleted:',
                            '该操作不可撤销。以下内容将被永久删除：',
                          )
                        : t(
                            'The worktree will be removed but the branch will be kept:',
                            '将删除 worktree，但保留分支：',
                          )}
                    </p>
                    <ul
                      style={{
                        margin: '0',
                        'padding-left': '20px',
                        display: 'flex',
                        'flex-direction': 'column',
                        gap: '4px',
                      }}
                    >
                      <Show when={willDeleteBranch}>
                        <li>
                          {t('Local feature branch', '本地功能分支')} <strong>{props.task.branchName}</strong>
                        </li>
                      </Show>
                      <li>
                        {t('Worktree at', 'Worktree 路径')} <strong>{props.task.worktreePath}</strong>
                      </li>
                      <Show when={!willDeleteBranch}>
                        <li style={{ color: theme.fgMuted }}>
                          {t('Branch', '分支')} <strong>{props.task.branchName}</strong>{' '}
                          {t('will be kept', '将被保留')}
                        </li>
                      </Show>
                    </ul>
                  </>
                );
              })()}
            </Show>
          </div>
        }
        confirmLabel={props.task.directMode ? t('Close', '关闭') : t('Delete', '删除')}
        danger={!props.task.directMode}
        onConfirm={() => {
          props.onCloseConfirmDone();
          closeTask(props.task.id);
        }}
        onCancel={() => props.onCloseConfirmDone()}
      />

      {/* Merge Dialog */}
      <ConfirmDialog
        open={props.showMergeConfirm}
        title={t('Merge into Main', '合并到主分支')}
        width="520px"
        autoFocusCancel
        message={
          <div>
            <Show when={worktreeStatus()?.has_uncommitted_changes}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                  'font-weight': '600',
                }}
              >
                {t(
                  'Warning: You have uncommitted changes that will NOT be included in this merge.',
                  '警告：你有未提交修改，这些修改不会被包含到本次合并中。',
                )}
              </div>
            </Show>
            <Show when={!worktreeStatus.loading && !hasCommittedChangesToMerge()}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.warning,
                  background: `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                  'font-weight': '600',
                }}
              >
                {t(
                  'Nothing to merge: this branch has no committed changes compared to main/master.',
                  '没有可合并内容：该分支相对主分支没有已提交的变更。',
                )}
              </div>
            </Show>
            <Show when={mergeStatus.loading}>
              <div
                style={{
                  'margin-bottom': '12px',
                  'font-size': '12px',
                  color: theme.fgMuted,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                }}
              >
                {t('Checking for conflicts with main...', '正在检查与主分支的冲突...')}
              </div>
            </Show>
            <Show when={!mergeStatus.loading && mergeStatus()}>
              {(status) => (
                <Show when={status().main_ahead_count > 0}>
                  <div
                    style={{
                      'margin-bottom': '12px',
                      'font-size': '12px',
                      color: hasConflicts() ? theme.error : theme.warning,
                      background: hasConflicts()
                        ? `color-mix(in srgb, ${theme.error} 8%, transparent)`
                        : `color-mix(in srgb, ${theme.warning} 8%, transparent)`,
                      padding: '8px 12px',
                      'border-radius': '8px',
                      border: hasConflicts()
                        ? `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`
                        : `1px solid color-mix(in srgb, ${theme.warning} 20%, transparent)`,
                      'font-weight': '600',
                    }}
                  >
                    <Show when={!hasConflicts()}>
                      {t(
                        `Main has ${status().main_ahead_count} new commit${
                          status().main_ahead_count > 1 ? 's' : ''
                        }. Rebase onto main first.`,
                        `主分支有 ${status().main_ahead_count} 个新提交。请先 rebase 到主分支。`,
                      )}
                    </Show>
                    <Show when={hasConflicts()}>
                      <div>
                        {t(
                          `Conflicts detected with main (${status().conflicting_files.length} file${
                            status().conflicting_files.length > 1 ? 's' : ''
                          }):`,
                          `检测到与主分支冲突（${status().conflicting_files.length} 个文件）：`,
                        )}
                      </div>
                      <ul
                        style={{ margin: '4px 0 0', 'padding-left': '20px', 'font-weight': '400' }}
                      >
                        <For each={status().conflicting_files}>{(f) => <li>{f}</li>}</For>
                      </ul>
                      <div style={{ 'margin-top': '4px', 'font-weight': '400' }}>
                        {t('Rebase onto main to resolve conflicts.', '请先 rebase 到主分支以解决冲突。')}
                      </div>
                    </Show>
                  </div>
                  <div
                    style={{
                      'margin-bottom': '12px',
                      display: 'flex',
                      'align-items': 'center',
                      gap: '8px',
                    }}
                  >
                    <button
                      type="button"
                      disabled={rebasing() || worktreeStatus()?.has_uncommitted_changes}
                      onClick={async () => {
                        setRebasing(true);
                        setRebaseError('');
                        setRebaseSuccess(false);
                        try {
                          await invoke(IPC.RebaseTask, { worktreePath: props.task.worktreePath });
                          setRebaseSuccess(true);
                          refetchMergeStatus();
                        } catch (err) {
                          setRebaseError(String(err));
                        } finally {
                          setRebasing(false);
                        }
                      }}
                      title={
                        worktreeStatus()?.has_uncommitted_changes
                          ? t('Commit or stash changes before rebasing', 'rebase 前请先提交或暂存修改')
                          : t('Rebase onto main', 'rebase 到主分支')
                      }
                      style={{
                        padding: '6px 14px',
                        background: theme.bgInput,
                        border: `1px solid ${theme.border}`,
                        'border-radius': '8px',
                        color: theme.fg,
                        cursor:
                          rebasing() || worktreeStatus()?.has_uncommitted_changes
                            ? 'not-allowed'
                            : 'pointer',
                        'font-size': '12px',
                        opacity:
                          rebasing() || worktreeStatus()?.has_uncommitted_changes ? '0.5' : '1',
                      }}
                    >
                      {rebasing() ? t('Rebasing...', 'Rebase 中...') : t('Rebase onto main', 'Rebase 到主分支')}
                    </button>
                    <Show
                      when={
                        props.task.agentIds.length > 0 &&
                        store.agents[props.task.agentIds[0]]?.status === 'running'
                      }
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const agentId = props.task.agentIds[0];
                          props.onMergeConfirmDone();
                          sendPrompt(props.task.id, agentId, 'rebase on main branch').catch(
                            (err) => {
                              console.error('Failed to send rebase prompt:', err);
                            },
                          );
                        }}
                        title={t('Close dialog and ask the AI agent to rebase', '关闭弹窗并请求 AI 执行 rebase')}
                        style={{
                          padding: '6px 14px',
                          background: theme.accent,
                          border: 'none',
                          'border-radius': '8px',
                          color: theme.accentText,
                          cursor: 'pointer',
                          'font-size': '12px',
                          'font-weight': '600',
                        }}
                      >
                        {t('Rebase with AI', '让 AI 执行 Rebase')}
                      </button>
                    </Show>
                    <Show when={rebaseSuccess()}>
                      <span style={{ 'font-size': '12px', color: theme.success }}>
                        {t('Rebase successful', 'Rebase 成功')}
                      </span>
                    </Show>
                    <Show when={rebaseError()}>
                      <span style={{ 'font-size': '12px', color: theme.error }}>
                        {rebaseError()}
                      </span>
                    </Show>
                  </div>
                </Show>
              )}
            </Show>
            <p style={{ margin: '0 0 12px' }}>
              {t('Merge', '合并')} <strong>{props.task.branchName}</strong> {t('into main:', '到主分支：')}
            </p>
            <Show when={!branchLog.loading && branchLog()}>
              {(log) => {
                const commits = () =>
                  log()
                    .split('\n')
                    .filter((l: string) => l.trim())
                    .map((l: string) => l.replace(/^- /, ''));
                return (
                  <div
                    style={{
                      'margin-bottom': '12px',
                      'max-height': '120px',
                      'overflow-y': 'auto',
                      'font-family': "'JetBrains Mono', monospace",
                      'font-size': '11px',
                      border: `1px solid ${theme.border}`,
                      'border-radius': '8px',
                      overflow: 'hidden',
                      padding: '4px 0',
                    }}
                  >
                    <For each={commits()}>
                      {(msg) => (
                        <div
                          title={msg}
                          style={{
                            display: 'flex',
                            'align-items': 'center',
                            gap: '6px',
                            padding: '2px 8px',
                            'white-space': 'nowrap',
                            overflow: 'hidden',
                            'text-overflow': 'ellipsis',
                            color: theme.fg,
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            style={{ 'flex-shrink': '0' }}
                          >
                            <circle
                              cx="5"
                              cy="5"
                              r="3"
                              fill="none"
                              stroke={theme.accent}
                              stroke-width="1.5"
                            />
                          </svg>
                          <span
                            style={{
                              overflow: 'hidden',
                              'text-overflow': 'ellipsis',
                            }}
                          >
                            {msg}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                );
              }}
            </Show>
            <div
              style={{
                border: `1px solid ${theme.border}`,
                'border-radius': '8px',
                overflow: 'hidden',
                'max-height': '240px',
                display: 'flex',
                'flex-direction': 'column',
              }}
            >
              <ChangedFilesList
                worktreePath={props.task.worktreePath}
                isActive={props.showMergeConfirm}
                onFileClick={props.onDiffFileClick}
              />
            </div>
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-top': '12px',
                cursor: 'pointer',
                'font-size': '13px',
                color: theme.fg,
              }}
            >
              <input
                type="checkbox"
                checked={cleanupAfterMerge()}
                onChange={(e) => setCleanupAfterMerge(e.currentTarget.checked)}
                style={{ cursor: 'pointer' }}
              />
              {t('Delete branch and worktree after merge', '合并后删除分支和 worktree')}
            </label>
            <label
              style={{
                display: 'flex',
                'align-items': 'center',
                gap: '8px',
                'margin-top': '8px',
                cursor: 'pointer',
                'font-size': '13px',
                color: theme.fg,
              }}
            >
              <input
                type="checkbox"
                checked={squash()}
                onChange={(e) => {
                  const checked = e.currentTarget.checked;
                  setSquash(checked);
                  if (checked && !squashMessage()) {
                    setSquashMessage(branchLog() ?? '');
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              {t('Squash commits', '压缩提交（Squash）')}
            </label>
            <Show when={squash()}>
              <textarea
                value={squashMessage()}
                onInput={(e) => setSquashMessage(e.currentTarget.value)}
                placeholder={t('Commit message...', '提交说明...')}
                rows={6}
                style={{
                  'margin-top': '8px',
                  width: '100%',
                  background: theme.bgInput,
                  border: `1px solid ${theme.border}`,
                  'border-radius': '8px',
                  padding: '8px 10px',
                  color: theme.fg,
                  'font-size': '12px',
                  'font-family': "'JetBrains Mono', monospace",
                  resize: 'vertical',
                  outline: 'none',
                  'box-sizing': 'border-box',
                }}
              />
            </Show>
            <Show when={mergeError()}>
              <div
                style={{
                  'margin-top': '12px',
                  'font-size': '12px',
                  color: theme.error,
                  background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
                }}
              >
                {mergeError()}
              </div>
            </Show>
          </div>
        }
        confirmDisabled={merging() || hasConflicts() || !hasCommittedChangesToMerge()}
        confirmLoading={merging()}
        confirmLabel={
          merging() ? t('Merging...', '合并中...') : squash() ? t('Squash Merge', '压缩合并') : t('Merge', '合并')
        }
        onConfirm={() => {
          const taskId = props.task.id;
          const onDone = props.onMergeConfirmDone;
          setMergeError('');
          setMerging(true);
          void mergeTask(taskId, {
            squash: squash(),
            message: squash() ? squashMessage() || undefined : undefined,
            cleanup: cleanupAfterMerge(),
          })
            .then(() => {
              onDone();
            })
            .catch((err) => {
              setMergeError(String(err));
            })
            .finally(() => {
              setMerging(false);
            });
        }}
        onCancel={() => {
          props.onMergeConfirmDone();
          setMergeError('');
          setSquash(false);
          setCleanupAfterMerge(false);
          setSquashMessage('');
          setRebaseError('');
          setRebaseSuccess(false);
        }}
      />

      {/* Push Dialog */}
      <ConfirmDialog
        open={props.showPushConfirm}
        title={t('Push to Remote', '推送到远程')}
        message={
          <div>
            <p style={{ margin: '0 0 8px' }}>
              {t('Push branch', '将分支')} <strong>{props.task.branchName}</strong>{' '}
              {t('to remote?', '推送到远程？')}
            </p>
            <Show when={pushError()}>
              <div
                style={{
                  'margin-top': '12px',
                  'font-size': '12px',
                  color: theme.error,
                  background: `color-mix(in srgb, ${theme.error} 8%, transparent)`,
                  padding: '8px 12px',
                  'border-radius': '8px',
                  border: `1px solid color-mix(in srgb, ${theme.error} 20%, transparent)`,
                }}
              >
                {pushError()}
              </div>
            </Show>
          </div>
        }
        confirmLabel={pushing() ? t('Pushing...', '推送中...') : t('Push', '推送')}
        onConfirm={() => {
          const taskId = props.task.id;
          const onStart = props.onPushStart;
          const onDone = props.onPushConfirmDone;
          setPushError('');
          setPushing(true);
          onStart();
          void pushTask(taskId)
            .then(() => {
              onDone(true);
            })
            .catch((err) => {
              setPushError(String(err));
              onDone(false);
            })
            .finally(() => {
              setPushing(false);
            });
        }}
        onCancel={() => {
          props.onPushConfirmDone(false);
          setPushError('');
        }}
      />

      {/* Diff Viewer */}
      <DiffViewerDialog
        file={props.diffFile}
        worktreePath={props.task.worktreePath}
        onClose={props.onDiffClose}
      />
    </>
  );
}
