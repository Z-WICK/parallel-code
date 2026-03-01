import { For, Show, createMemo } from 'solid-js';
import { Dialog } from './Dialog';
import { getAvailableTerminalFonts, getTerminalFontFamily, LIGATURE_FONTS } from '../lib/fonts';
import { LOOK_PRESETS } from '../lib/look';
import { theme } from '../lib/theme';
import { localize } from '../lib/i18n';
import {
  store,
  setTerminalFont,
  setThemePreset,
  setLocale,
  setAutoTrustFolders,
  setInactiveColumnOpacity,
} from '../store/store';
import { CustomAgentEditor } from './CustomAgentEditor';
import { mod } from '../lib/platform';
import type { TerminalFont } from '../lib/fonts';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const t = (english: string, chinese: string) => localize(store.locale, english, chinese);

  const presetLabel = (id: (typeof LOOK_PRESETS)[number]['id']): string => {
    switch (id) {
      case 'minimal':
        return t('Minimal', '极简');
      case 'graphite':
        return t('Graphite', '石墨');
      case 'classic':
        return t('Classic', '经典');
      case 'indigo':
        return t('Indigo', '靛蓝');
      case 'ember':
        return t('Ember', '余烬');
      case 'glacier':
        return t('Glacier', '冰川');
      default:
        return id;
    }
  };

  const presetDescription = (id: (typeof LOOK_PRESETS)[number]['id']): string => {
    switch (id) {
      case 'minimal':
        return t('Flat monochrome with warm off-white accent', '暖白点缀的扁平单色风格');
      case 'graphite':
        return t('Cool neon blue with subtle glow', '冷调霓虹蓝与微光效果');
      case 'classic':
        return t('Original dark utilitarian look', '原始深色实用主义风格');
      case 'indigo':
        return t('Deep indigo base with electric violet accents', '深靛蓝基底与电光紫点缀');
      case 'ember':
        return t('Warm copper highlights and contrast', '暖铜色高光与高对比');
      case 'glacier':
        return t('Clean teal accents with softer depth', '清爽青色点缀与更柔和层次');
      default:
        return '';
    }
  };

  const fonts = createMemo<TerminalFont[]>(() => {
    const available = getAvailableTerminalFonts();
    // Always include the currently selected font so it stays visible even if detection misses it
    if (available.includes(store.terminalFont)) return available;
    return [store.terminalFont, ...available];
  });

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      width="640px"
      zIndex={1100}
      panelStyle={{ 'max-width': 'calc(100vw - 32px)', padding: '24px', gap: '18px' }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
        }}
      >
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <h2
            style={{
              margin: '0',
              'font-size': '16px',
              color: theme.fg,
              'font-weight': '600',
            }}
          >
            {t('Settings', '设置')}
          </h2>
          <span style={{ 'font-size': '12px', color: theme.fgSubtle }}>
            {t('Customize your workspace. Shortcut:', '自定义你的工作区。快捷键:')}{' '}
            <kbd
              style={{
                background: theme.bgInput,
                border: `1px solid ${theme.border}`,
                'border-radius': '4px',
                padding: '1px 6px',
                'font-family': "'JetBrains Mono', monospace",
                color: theme.fgMuted,
              }}
            >
              {mod}+,
            </kbd>
          </span>
        </div>
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

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Language', '语言')}
        </div>
        <div class="settings-theme-grid" style={{ 'grid-template-columns': 'repeat(2, minmax(0, 1fr))' }}>
          <button
            type="button"
            class={`settings-theme-card${store.locale === 'en' ? ' active' : ''}`}
            onClick={() => setLocale('en')}
          >
            <span class="settings-theme-title">English</span>
            <span class="settings-theme-desc">{t('English interface', '英文界面')}</span>
          </button>
          <button
            type="button"
            class={`settings-theme-card${store.locale === 'zh-CN' ? ' active' : ''}`}
            onClick={() => setLocale('zh-CN')}
          >
            <span class="settings-theme-title">简体中文</span>
            <span class="settings-theme-desc">{t('Chinese interface', '中文界面')}</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Theme', '主题')}
        </div>
        <div class="settings-theme-grid">
          <For each={LOOK_PRESETS}>
            {(preset) => (
              <button
                type="button"
                class={`settings-theme-card${store.themePreset === preset.id ? ' active' : ''}`}
                onClick={() => setThemePreset(preset.id)}
              >
                <span class="settings-theme-title">{presetLabel(preset.id)}</span>
                <span class="settings-theme-desc">{presetDescription(preset.id)}</span>
              </button>
            )}
          </For>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Behavior', '行为')}
        </div>
        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '10px',
            cursor: 'pointer',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="checkbox"
            checked={store.autoTrustFolders}
            onChange={(e) => setAutoTrustFolders(e.currentTarget.checked)}
            style={{ 'accent-color': theme.accent, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '2px' }}>
            <span style={{ 'font-size': '13px', color: theme.fg }}>
              {t('Auto-trust folders', '自动信任文件夹')}
            </span>
            <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
              {t(
                'Automatically accept trust and permission dialogs from agents',
                '自动接受来自代理的信任与权限对话框',
              )}
            </span>
          </div>
        </label>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Focus Dimming', '聚焦弱化')}
        </div>
        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            padding: '8px 12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
            }}
          >
            <span style={{ 'font-size': '13px', color: theme.fg }}>
              {t('Inactive column opacity', '非活动列透明度')}
            </span>
            <span
              style={{
                'font-size': '12px',
                color: theme.fgMuted,
                'font-family': "'JetBrains Mono', monospace",
                'min-width': '36px',
                'text-align': 'right',
              }}
            >
              {Math.round(store.inactiveColumnOpacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="100"
            step="5"
            value={store.inactiveColumnOpacity * 100}
            onInput={(e) => setInactiveColumnOpacity(Number(e.currentTarget.value) / 100)}
            style={{
              width: '100%',
              'accent-color': theme.accent,
              cursor: 'pointer',
            }}
          />
          <div
            style={{
              display: 'flex',
              'justify-content': 'space-between',
              'font-size': '10px',
              color: theme.fgSubtle,
            }}
          >
            <span>{t('More dimmed', '更暗')}</span>
            <span>{t('No dimming', '不弱化')}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Custom Agents', '自定义代理')}
        </div>
        <CustomAgentEditor />
      </div>

      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div
          style={{
            'font-size': '11px',
            color: theme.fgMuted,
            'text-transform': 'uppercase',
            'letter-spacing': '0.05em',
            'font-weight': '600',
          }}
        >
          {t('Terminal Font', '终端字体')}
        </div>
        <div class="settings-font-grid">
          <For each={fonts()}>
            {(font) => (
              <button
                type="button"
                class={`settings-font-card${store.terminalFont === font ? ' active' : ''}`}
                onClick={() => setTerminalFont(font)}
              >
                <span class="settings-font-name">{font}</span>
                <span
                  class="settings-font-preview"
                  style={{ 'font-family': getTerminalFontFamily(font) }}
                >
                  AaBb 0Oo1Il →
                </span>
              </button>
            )}
          </For>
        </div>
        <Show when={LIGATURE_FONTS.has(store.terminalFont)}>
          <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
            {t(
              'This font includes ligatures which may impact rendering performance.',
              '该字体包含连字，可能影响渲染性能。',
            )}
          </span>
        </Show>
      </div>
    </Dialog>
  );
}
