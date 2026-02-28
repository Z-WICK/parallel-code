export interface TerminalClipboardDeps {
  isMac: boolean;
  isGlobalShortcut: (e: KeyboardEvent) => boolean;
  getSelection: () => string;
  readClipboardText: () => Promise<string>;
  writeClipboardText: (text: string) => Promise<void> | void;
  enqueueInput: (text: string) => void;
}

/**
 * Handle terminal copy/paste shortcuts.
 * Returns true when xterm should continue processing the key event.
 */
export function handleTerminalClipboardKeyEvent(
  e: KeyboardEvent,
  deps: TerminalClipboardDeps,
): boolean {
  if (e.type !== 'keydown') return true;

  // Let global app shortcuts pass through to the window handler.
  if (deps.isGlobalShortcut(e)) return false;

  const isCopy = deps.isMac
    ? e.metaKey && !e.shiftKey && e.key === 'c'
    : e.ctrlKey && e.shiftKey && e.key === 'C';
  const isPaste = deps.isMac
    ? e.metaKey && !e.shiftKey && e.key === 'v'
    : e.ctrlKey && e.shiftKey && e.key === 'V';

  if (isCopy) {
    // Prevent native/default pasteboard handling from double-processing.
    e.preventDefault();
    e.stopPropagation();
    const selection = deps.getSelection();
    if (selection) void deps.writeClipboardText(selection);
    return false;
  }

  if (isPaste) {
    // Prevent native/default pasteboard handling from double-processing.
    e.preventDefault();
    e.stopPropagation();
    void deps.readClipboardText().then((text) => {
      if (text) deps.enqueueInput(text);
    });
    return false;
  }

  return true;
}
