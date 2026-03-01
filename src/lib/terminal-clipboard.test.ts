import { describe, expect, it, vi } from 'vitest';
import { handleTerminalClipboardKeyEvent } from './terminal-clipboard';

function createKeyboardEvent(
  partial: Partial<KeyboardEvent>,
): KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    type: 'keydown',
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault,
    stopPropagation,
    ...partial,
  } as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
    stopPropagation: ReturnType<typeof vi.fn>;
  };
}

describe('handleTerminalClipboardKeyEvent', () => {
  it('prevents default and sends clipboard text on macOS paste shortcut', async () => {
    const enqueueInput = vi.fn();
    const readClipboardText = vi.fn().mockResolvedValue('hello');
    const event = createKeyboardEvent({ key: 'v', metaKey: true });

    const handled = handleTerminalClipboardKeyEvent(event, {
      isMac: true,
      isGlobalShortcut: () => false,
      getSelection: () => '',
      readClipboardText,
      writeClipboardText: vi.fn(),
      enqueueInput,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(enqueueInput).toHaveBeenCalledWith('hello');
  });

  it('falls back to clipboard image when text is empty', async () => {
    const enqueueInput = vi.fn();
    const readClipboardText = vi.fn().mockResolvedValue('');
    const readClipboardItems = vi.fn().mockResolvedValue([
      {
        types: ['image/png'],
        getType: vi.fn().mockResolvedValue(new Blob(['png-bytes'], { type: 'image/png' })),
      },
    ]);
    const saveClipboardImage = vi.fn().mockResolvedValue('/tmp/clipboard-image.png');
    const event = createKeyboardEvent({ key: 'v', metaKey: true });

    const handled = handleTerminalClipboardKeyEvent(event, {
      isMac: true,
      isGlobalShortcut: () => false,
      getSelection: () => '',
      readClipboardText,
      readClipboardItems,
      saveClipboardImage,
      writeClipboardText: vi.fn(),
      enqueueInput,
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readClipboardText).toHaveBeenCalledTimes(1);
    expect(readClipboardItems).toHaveBeenCalledTimes(1);
    expect(saveClipboardImage).toHaveBeenCalledTimes(1);
    expect(enqueueInput).toHaveBeenCalledWith('/tmp/clipboard-image.png');
  });

  it('prevents default and writes selection on macOS copy shortcut', () => {
    const writeClipboardText = vi.fn();
    const event = createKeyboardEvent({ key: 'c', metaKey: true });

    const handled = handleTerminalClipboardKeyEvent(event, {
      isMac: true,
      isGlobalShortcut: () => false,
      getSelection: () => 'selected-text',
      readClipboardText: vi.fn().mockResolvedValue(''),
      writeClipboardText,
      enqueueInput: vi.fn(),
    });

    expect(handled).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(writeClipboardText).toHaveBeenCalledWith('selected-text');
  });

  it('returns true for non-shortcut key events', () => {
    const event = createKeyboardEvent({ key: 'x' });

    const handled = handleTerminalClipboardKeyEvent(event, {
      isMac: true,
      isGlobalShortcut: () => false,
      getSelection: () => '',
      readClipboardText: vi.fn().mockResolvedValue(''),
      writeClipboardText: vi.fn(),
      enqueueInput: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });
});
