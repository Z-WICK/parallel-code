import { createSignal, onMount, Show } from 'solid-js';
import { initAuth, getRefreshToken, refreshAuthToken } from './auth';
import { connect } from './ws';
import { AgentList } from './AgentList';
import { AgentDetail } from './AgentDetail';
import { getPreferredLocale, localize } from '../lib/i18n';

export function App() {
  const locale = getPreferredLocale();
  const t = (english: string, chinese: string) => localize(locale, english, chinese);
  const [authed, setAuthed] = createSignal(false);
  // Separate view state from detail data so the agentId/taskName signals
  // never become empty while AgentDetail is still mounted (avoids reactive
  // race where Show disposes children *after* props re-evaluate to null).
  const [view, setView] = createSignal<'list' | 'detail'>('list');
  const [detailAgentId, setDetailAgentId] = createSignal('');
  const [detailTaskName, setDetailTaskName] = createSignal('');

  function selectAgent(id: string, name: string) {
    setDetailAgentId(id);
    setDetailTaskName(name);
    setView('detail');
  }

  onMount(() => {
    const token = initAuth();
    if (token) {
      setAuthed(true);
      connect();
      return;
    }

    // App may be launched from Home Screen long after access-token rotation.
    // If a refresh token exists, try a silent re-auth before showing fallback.
    if (getRefreshToken()) {
      void refreshAuthToken().then((ok) => {
        if (!ok) return;
        setAuthed(true);
        connect();
      });
    }
  });

  return (
    <Show
      when={authed()}
      fallback={
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            height: '100%',
            color: '#999',
            'font-size': '16px',
            padding: '20px',
            'text-align': 'center',
          }}
        >
          <div>
            <p style={{ 'margin-bottom': '12px' }}>{t('Not authenticated.', '未通过认证。')}</p>
            <p style={{ 'font-size': '13px', color: '#666' }}>
              {t(
                'Scan the QR code from the Parallel Code desktop app to connect.',
                '请扫描 Parallel Code 桌面端的二维码进行连接。',
              )}
            </p>
          </div>
        </div>
      }
    >
      <Show when={view() === 'detail'} fallback={<AgentList onSelect={selectAgent} />}>
        <AgentDetail
          agentId={detailAgentId()}
          taskName={detailTaskName()}
          onBack={() => setView('list')}
        />
      </Show>
    </Show>
  );
}
