export interface TerminalClipboardDeps {
  isMac: boolean;
  isGlobalShortcut: (e: KeyboardEvent) => boolean;
  getSelection: () => string;
  readClipboardText: () => Promise<string>;
  readClipboardItems?: () => Promise<ClipboardImageItem[]>;
  saveClipboardImage?: (base64Data: string, mimeType: string) => Promise<string>;
  writeClipboardText: (text: string) => Promise<void> | void;
  enqueueInput: (text: string) => void;
}

export interface ClipboardImageItem {
  types: string[];
  getType: (type: string) => Promise<Blob>;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function extractClipboardImagePath(
  deps: TerminalClipboardDeps,
): Promise<string | null> {
  if (!deps.readClipboardItems || !deps.saveClipboardImage) return null;
  const items = await deps.readClipboardItems().catch(() => []);
  for (const item of items) {
    const mimeType = item.types.find((type) => type.startsWith('image/'));
    if (!mimeType) continue;
    const blob = await item.getType(mimeType).catch(() => null);
    if (!blob || blob.size === 0) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0) continue;
    const base64Data = bytesToBase64(bytes);
    return deps.saveClipboardImage(base64Data, mimeType).catch(() => null);
  }
  return null;
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
    void deps.readClipboardText().then(async (text) => {
      if (text) {
        deps.enqueueInput(text);
        return;
      }
      const imagePath = await extractClipboardImagePath(deps);
      if (imagePath) deps.enqueueInput(imagePath);
    });
    return false;
  }

  return true;
}
