/** @vitest-environment jsdom */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'solid-js/web';
import { PromptInput } from './PromptInput';
import type { SlashCommand } from '../store/types';

const mockCommands: SlashCommand[] = [
  {
    id: 'cmd-help',
    name: '/help',
    description: 'Show help',
    source: 'built-in',
  },
  {
    id: 'cmd-shell',
    name: '/shell',
    description: 'Open shell panel',
    source: 'custom',
  },
];

const { mockSendPrompt, mockInvoke } = vi.hoisted(() => ({
  mockSendPrompt: vi.fn(async (_taskId: string, _agentId: string, _text: string) => undefined),
  mockInvoke: vi.fn(async (_channel: string, _payload?: unknown) => undefined),
}));

vi.mock('../store/store', () => ({
  store: {
    locale: 'en',
  },
  sendPrompt: mockSendPrompt,
  registerFocusFn: vi.fn(),
  unregisterFocusFn: vi.fn(),
  registerAction: vi.fn(),
  unregisterAction: vi.fn(),
  getAgentOutputTail: vi.fn(() => ''),
  stripAnsi: (s: string) => s,
  onAgentReady: vi.fn(),
  offAgentReady: vi.fn(),
  normalizeForComparison: (s: string) => s,
  looksLikeQuestion: vi.fn(() => false),
  isTrustQuestionAutoHandled: vi.fn(() => false),
  isAutoTrustSettling: vi.fn(() => false),
  isAgentAskingQuestion: vi.fn(() => false),
  getTaskFocusedPanel: vi.fn(() => 'prompt'),
  setTaskFocusedPanel: vi.fn(),
  getSlashCommands: () => mockCommands,
}));

vi.mock('../lib/ipc', () => ({
  invoke: mockInvoke,
}));

vi.mock('../../electron/ipc/channels', () => ({
  IPC: {
    WriteToAgent: 'WriteToAgent',
  },
}));

describe('PromptInput slash interactions', () => {
  const mountedCleanups = new Set<() => void>();

  beforeEach(() => {
    mockSendPrompt.mockClear();
    mockInvoke.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    for (const cleanup of mountedCleanups) {
      cleanup();
    }
    mountedCleanups.clear();
    document.body.innerHTML = '';
  });

  function mountPromptInput() {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const dispose = render(
      () =>
        PromptInput({
          taskId: 'task-1',
          agentId: 'agent-1',
        }),
      host,
    );

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) throw new Error('textarea not found');

    const cleanup = () => {
      dispose();
      host.remove();
      mountedCleanups.delete(cleanup);
    };
    mountedCleanups.add(cleanup);

    return {
      host,
      textarea,
      cleanup,
    };
  }

  function inputText(textarea: HTMLTextAreaElement, value: string) {
    textarea.value = value;
    textarea.setSelectionRange(value.length, value.length);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  }

  function getRenderedCommandNames() {
    return Array.from(document.querySelectorAll('.slash-command-name')).map((el) =>
      (el.textContent ?? '').trim(),
    );
  }

  it('shows slash menu when first token starts with slash', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/he');

    const menu = document.querySelector('.slash-command-menu');
    expect(menu).toBeTruthy();

    cleanup();
  });

  it('renders built-in and custom commands together for root slash query', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/');

    expect(getRenderedCommandNames()).toEqual(['/help', '/shell']);

    cleanup();
  });

  it('filters commands by query text', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/she');

    expect(getRenderedCommandNames()).toEqual(['/shell']);

    cleanup();
  });

  it('does not show slash menu when slash appears outside first token', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, 'hello /he');

    const menu = document.querySelector('.slash-command-menu');
    expect(menu).toBeFalsy();

    cleanup();
  });

  it('uses Enter for completion instead of send while slash menu is open', async () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/sh');

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    await Promise.resolve();

    expect(textarea.value.startsWith('/shell')).toBe(true);
    expect(mockSendPrompt).not.toHaveBeenCalled();

    cleanup();
  });

  it('uses Tab for completion while slash menu is open', async () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/sh');

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    await Promise.resolve();

    expect(textarea.value.startsWith('/shell')).toBe(true);
    expect(mockSendPrompt).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not block Enter send when slash menu is closed (no match)', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/zzz');

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);

    expect(mockSendPrompt).toHaveBeenCalledTimes(1);

    cleanup();
  });

  it('cycles highlighted command with ArrowUp/ArrowDown', async () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/');

    const down = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(down);

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(enter);
    await Promise.resolve();

    expect(textarea.value.startsWith('/shell')).toBe(true);

    inputText(textarea, '/');
    const up = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(up);
    textarea.dispatchEvent(enter);
    await Promise.resolve();

    expect(textarea.value.startsWith('/shell')).toBe(true);

    cleanup();
  });

  it('closes slash menu on Escape', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/sh');
    expect(document.querySelector('.slash-command-menu')).toBeTruthy();

    const esc = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(esc);

    expect(document.querySelector('.slash-command-menu')).toBeFalsy();

    cleanup();
  });

  it('does not trigger slash key handling during IME composition', () => {
    const { textarea, cleanup } = mountPromptInput();

    inputText(textarea, '/he');

    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'isComposing', { value: true });
    textarea.dispatchEvent(event);

    expect(textarea.value).toBe('/he');
    expect(mockSendPrompt).not.toHaveBeenCalled();

    cleanup();
  });
});
