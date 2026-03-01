import { For } from 'solid-js';
import { Dialog } from './Dialog';
import { theme } from '../lib/theme';
import { alt, mod } from '../lib/platform';
import { store } from '../store/store';
import { localize } from '../lib/i18n';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog(props: HelpDialogProps) {
  const t = (english: string, chinese: string) => localize(store.locale, english, chinese);

  const sections = [
    {
      title: t('Navigation', '导航'),
      shortcuts: [
        [`${alt} + Up/Down`, t('Move between panels or sidebar tasks', '在面板或侧栏任务间移动')],
        [`${alt} + Left/Right`, t('Navigate within row or across tasks', '在行内或任务之间导航')],
        [`${alt} + Left (from first task)`, t('Focus sidebar', '聚焦侧边栏')],
        [`${alt} + Right (from sidebar)`, t('Focus active task', '聚焦当前任务')],
        [t('Enter (in sidebar)', 'Enter（在侧栏）'), t('Jump to active task panel', '跳转到活动任务面板')],
      ],
    },
    {
      title: t('Task Actions', '任务操作'),
      shortcuts: [
        [`${mod} + Enter`, t('Send prompt', '发送提示词')],
        [`${mod} + W`, t('Close focused terminal', '关闭当前终端')],
        [`${mod} + Shift + W`, t('Close active task/terminal', '关闭当前任务/终端')],
        [`${mod} + Shift + M`, t('Merge active task', '合并当前任务')],
        [`${mod} + Shift + P`, t('Push to remote', '推送到远程')],
        [`${mod} + Shift + T`, t('New task shell terminal', '新建任务 Shell 终端')],
        [`${mod} + Shift + Left/Right`, t('Reorder tasks/terminals', '重排任务/终端顺序')],
      ],
    },
    {
      title: t('App', '应用'),
      shortcuts: [
        [`${mod} + N`, t('New task', '新建任务')],
        [`${mod} + Shift + D`, t('New standalone terminal', '新建独立终端')],
        [`${mod} + Shift + A`, t('New task', '新建任务')],
        [`${mod} + B`, t('Toggle sidebar', '切换侧边栏')],
        [`${mod} + ,`, t('Open settings', '打开设置')],
        [`${mod} + 0`, t('Reset zoom', '重置缩放')],
        ['Ctrl + Shift + Scroll', t('Resize all panel widths', '调整所有面板宽度')],
        [`${mod} + / or F1`, t('Toggle this help', '切换此帮助面板')],
        ['Escape', t('Close dialogs', '关闭对话框')],
      ],
    },
  ];

  return (
    <Dialog open={props.open} onClose={props.onClose} width="480px" panelStyle={{ gap: '20px' }}>
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <h2 style={{ margin: '0', 'font-size': '16px', color: theme.fg, 'font-weight': '600' }}>
          {t('Keyboard Shortcuts', '键盘快捷键')}
        </h2>
        <button
          onClick={() => props.onClose()}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.fgMuted,
            cursor: 'pointer',
            'font-size': '18px',
            padding: '0 4px',
            'line-height': '1',
          }}
        >
          &times;
        </button>
      </div>

      <For each={sections}>
        {(section) => (
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
            <div
              style={{
                'font-size': '11px',
                color: theme.fgMuted,
                'text-transform': 'uppercase',
                'letter-spacing': '0.05em',
                'font-weight': '600',
              }}
            >
              {section.title}
            </div>
            <For each={section.shortcuts}>
              {([key, desc]) => (
                <div
                  style={{
                    display: 'flex',
                    'justify-content': 'space-between',
                    'align-items': 'center',
                    padding: '4px 0',
                  }}
                >
                  <span style={{ color: theme.fgMuted, 'font-size': '12px' }}>{desc}</span>
                  <kbd
                    style={{
                      background: theme.bgInput,
                      border: `1px solid ${theme.border}`,
                      'border-radius': '4px',
                      padding: '2px 8px',
                      'font-size': '11px',
                      color: theme.fg,
                      'font-family': "'JetBrains Mono', monospace",
                      'white-space': 'nowrap',
                    }}
                  >
                    {key}
                  </kbd>
                </div>
              )}
            </For>
          </div>
        )}
      </For>
    </Dialog>
  );
}
