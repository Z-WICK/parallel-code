import { createMemo } from 'solid-js';
import {
  getCompletedTasksTodayCount,
  getMergedLineTotals,
  toggleHelpDialog,
  toggleArena,
} from '../store/store';
import { theme } from '../lib/theme';
import { sf } from '../lib/fontScale';
import { alt, mod } from '../lib/platform';
import { store } from '../store/core';
import { localize } from '../lib/i18n';

export function SidebarFooter() {
  const t = (english: string, chinese: string) => localize(store.locale, english, chinese);
  const completedTasksToday = createMemo(() => getCompletedTasksTodayCount());
  const mergedLines = createMemo(() => getMergedLineTotals());

  return (
    <>
      <div
        style={{
          'border-top': `1px solid ${theme.border}`,
          'padding-top': '12px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '6px',
          'flex-shrink': '0',
        }}
      >
        <span
          style={{
            'font-size': sf(10),
            color: theme.fgSubtle,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
          }}
        >
          {t('Progress', '进度')}
        </span>
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            'border-radius': '8px',
            padding: '8px 10px',
            'font-size': sf(11),
            color: theme.fgMuted,
          }}
        >
          <span>{t('Completed today', '今日完成')}</span>
          <span
            style={{
              color: theme.fg,
              'font-weight': '600',
              'font-variant-numeric': 'tabular-nums',
            }}
          >
            {completedTasksToday()}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'space-between',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
            'border-radius': '8px',
            padding: '8px 10px',
            'font-size': sf(11),
            color: theme.fgMuted,
          }}
        >
          <span>{t('Merged to main/master', '合并到主分支')}</span>
          <span
            style={{
              color: theme.fg,
              'font-weight': '600',
              'font-variant-numeric': 'tabular-nums',
              display: 'flex',
              'align-items': 'center',
              gap: '8px',
            }}
          >
            <span style={{ color: theme.success }}>+{mergedLines().added.toLocaleString()}</span>
            <span style={{ color: theme.error }}>-{mergedLines().removed.toLocaleString()}</span>
          </span>
        </div>
        <button
          onClick={() => toggleArena(true)}
          style={{
            width: '100%',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            gap: '6px',
            background: 'transparent',
            border: `1px solid ${theme.border}`,
            'border-radius': '8px',
            padding: '8px 14px',
            'font-size': sf(12),
            color: theme.fgMuted,
            cursor: 'pointer',
            'font-family': 'inherit',
            'font-weight': '500',
            'margin-top': '6px',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 3L13 13M9 12L12 9" />
            <path d="M13 3L3 13M4 9L7 12" />
          </svg>
          {t('Arena', '竞技场')}
        </button>
      </div>

      {/* Tips */}
      <div
        onClick={() => toggleHelpDialog(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleHelpDialog(true);
          }
        }}
        tabIndex={0}
        role="button"
        style={{
          'border-top': `1px solid ${theme.border}`,
          'padding-top': '12px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '6px',
          'flex-shrink': '0',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            'font-size': sf(10),
            color: theme.fgSubtle,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
          }}
        >
          {t('Tips', '提示')}
        </span>
        <span
          style={{
            'font-size': sf(11),
            color: theme.fgMuted,
            'line-height': '1.4',
          }}
        >
          <kbd
            style={{
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '3px',
              padding: '1px 4px',
              'font-size': sf(10),
              'font-family': "'JetBrains Mono', monospace",
            }}
          >
            {alt} + Arrows
          </kbd>{' '}
          {t('to navigate panels', '用于切换面板')}
        </span>
        <span
          style={{
            'font-size': sf(11),
            color: theme.fgMuted,
            'line-height': '1.4',
          }}
        >
          <kbd
            style={{
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
              'border-radius': '3px',
              padding: '1px 4px',
              'font-size': sf(10),
              'font-family': "'JetBrains Mono', monospace",
            }}
          >
            {mod} + /
          </kbd>{' '}
          {t('for all shortcuts', '查看全部快捷键')}
        </span>
      </div>
    </>
  );
}
