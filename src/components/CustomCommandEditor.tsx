import { For, Show, createSignal } from 'solid-js';
import { theme } from '../lib/theme';
import { localize } from '../lib/i18n';
import { store, addCustomSlashCommand, removeCustomSlashCommand } from '../store/store';

export function CustomCommandEditor() {
  const t = (english: string, chinese: string) => localize(store.locale, english, chinese);
  const [showForm, setShowForm] = createSignal(false);
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [template, setTemplate] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  function resetForm() {
    setName('');
    setDescription('');
    setTemplate('');
    setError(null);
    setShowForm(false);
  }

  function handleAdd() {
    const result = addCustomSlashCommand({
      name: name(),
      description: description(),
      template: template(),
    });

    if (!result.ok) {
      setError(
        result.reason === 'invalid_name'
          ? t(
              'Command name must look like /my-command (letters, numbers, -, _, ., :).',
              '命令名必须是 /my-command 这种格式（字母、数字、-, _, ., :）。',
            )
          : result.reason === 'invalid_description'
            ? t('Description cannot be empty.', '描述不能为空。')
            : t('Command already exists.', '命令已存在。'),
      );
      return;
    }

    resetForm();
  }

  const inputStyle = () => ({
    padding: '8px 10px',
    background: theme.bgInput,
    border: `1px solid ${theme.border}`,
    'border-radius': '6px',
    color: theme.fg,
    'font-size': '12px',
    width: '100%',
    'box-sizing': 'border-box' as const,
  });

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
      <For each={store.customSlashCommands}>
        {(command) => (
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
              gap: '8px',
              padding: '8px 12px',
              'border-radius': '8px',
              background: theme.bgInput,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{ display: 'flex', 'flex-direction': 'column', gap: '2px', 'min-width': 0 }}
            >
              <span
                style={{
                  'font-size': '12px',
                  color: theme.fg,
                  'font-family': "'JetBrains Mono', monospace",
                }}
              >
                {command.name}
              </span>
              <span style={{ 'font-size': '11px', color: theme.fgSubtle }}>
                {command.description}
              </span>
            </div>
            <button
              type="button"
              onClick={() => removeCustomSlashCommand(command.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: theme.fgMuted,
                cursor: 'pointer',
                'font-size': '16px',
                padding: '0 4px',
              }}
            >
              &times;
            </button>
          </div>
        )}
      </For>

      <Show when={!showForm()}>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 12px',
            background: 'transparent',
            border: `1px dashed ${theme.border}`,
            'border-radius': '8px',
            color: theme.fgMuted,
            cursor: 'pointer',
            'font-size': '12px',
          }}
        >
          + {t('Add custom command', '添加自定义命令')}
        </button>
      </Show>

      <Show when={showForm()}>
        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            padding: '12px',
            'border-radius': '8px',
            background: theme.bgInput,
            border: `1px solid ${theme.border}`,
          }}
        >
          <input
            type="text"
            placeholder={t('Command name (e.g. /review-pr)', '命令名（例如 /review-pr）')}
            value={name()}
            onInput={(e) => {
              setName(e.currentTarget.value);
              setError(null);
            }}
            style={inputStyle()}
          />
          <input
            type="text"
            placeholder={t('Description (for dropdown)', '描述（用于下拉提示）')}
            value={description()}
            onInput={(e) => {
              setDescription(e.currentTarget.value);
              setError(null);
            }}
            style={inputStyle()}
          />
          <input
            type="text"
            placeholder={t('Template (optional)', '模板（可选）')}
            value={template()}
            onInput={(e) => {
              setTemplate(e.currentTarget.value);
              setError(null);
            }}
            style={inputStyle()}
          />
          <Show when={error()}>
            {(message) => (
              <span style={{ color: theme.error, 'font-size': '11px', 'line-height': '1.35' }}>
                {message()}
              </span>
            )}
          </Show>
          <div style={{ display: 'flex', gap: '8px', 'justify-content': 'flex-end' }}>
            <button
              type="button"
              onClick={() => resetForm()}
              style={{
                padding: '6px 14px',
                background: 'transparent',
                border: `1px solid ${theme.border}`,
                'border-radius': '6px',
                color: theme.fgMuted,
                cursor: 'pointer',
                'font-size': '12px',
              }}
            >
              {t('Cancel', '取消')}
            </button>
            <button
              type="button"
              onClick={handleAdd}
              style={{
                padding: '6px 14px',
                background: theme.accent,
                border: 'none',
                'border-radius': '6px',
                color: '#fff',
                cursor: 'pointer',
                'font-size': '12px',
                opacity: name().trim() && description().trim() ? 1 : 0.5,
              }}
            >
              {t('Add Command', '添加命令')}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
