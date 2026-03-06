import { produce } from 'solid-js/store';
import { invoke } from '../lib/ipc';
import { IPC } from '../../electron/ipc/channels';
import { store, setStore } from './core';
import type { SlashCommand } from './types';

const BUILT_IN_SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  {
    id: 'builtin-help',
    name: '/help',
    description: 'Show available commands',
    source: 'built-in',
  },
  {
    id: 'builtin-clear',
    name: '/clear',
    description: 'Clear current conversation context',
    source: 'built-in',
  },
  {
    id: 'builtin-compact',
    name: '/compact',
    description: 'Summarize current conversation',
    source: 'built-in',
  },
  {
    id: 'builtin-review',
    name: '/review',
    description: 'Run code review workflow',
    source: 'built-in',
  },
  {
    id: 'builtin-plan',
    name: '/plan',
    description: 'Create an implementation plan',
    source: 'built-in',
  },
];

function normalizeCommandName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

const MAX_COMMAND_DESCRIPTION_LENGTH = 200;
const MAX_COMMAND_TEMPLATE_LENGTH = 500;

function sanitizeTextInput(input: string, maxLength: number): string {
  return input
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function normalizeCustomCommand(input: Omit<SlashCommand, 'source'>): SlashCommand {
  const name = normalizeCommandName(input.name);
  return {
    id: input.id,
    name,
    description: sanitizeTextInput(input.description, MAX_COMMAND_DESCRIPTION_LENGTH),
    template: input.template
      ? sanitizeTextInput(input.template, MAX_COMMAND_TEMPLATE_LENGTH) || undefined
      : undefined,
    source: 'custom',
  };
}

function normalizeCliCommand(input: Omit<SlashCommand, 'source'>): SlashCommand | null {
  const name = normalizeCommandName(input.name);
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/.test(name)) return null;
  const description =
    sanitizeTextInput(input.description, MAX_COMMAND_DESCRIPTION_LENGTH) || 'Claude CLI command';
  return {
    id: input.id,
    name,
    description,
    source: 'cli',
  };
}

function mergeSlashCommands(
  builtIns: ReadonlyArray<SlashCommand>,
  cliCommands: ReadonlyArray<SlashCommand>,
  customs: ReadonlyArray<SlashCommand>,
): SlashCommand[] {
  const byName = new Map<string, SlashCommand>();

  for (const command of builtIns) {
    byName.set(command.name.toLowerCase(), { ...command });
  }

  for (const command of cliCommands) {
    byName.set(command.name.toLowerCase(), { ...command, source: 'cli' });
  }

  for (const command of customs) {
    byName.set(command.name.toLowerCase(), { ...command, source: 'custom' });
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getBuiltInSlashCommands(): SlashCommand[] {
  return BUILT_IN_SLASH_COMMANDS.map((c) => ({ ...c }));
}

export function getSlashCommands(): SlashCommand[] {
  return mergeSlashCommands(
    getBuiltInSlashCommands(),
    store.cliSlashCommands,
    store.customSlashCommands,
  );
}

export async function loadCliSlashCommands(): Promise<void> {
  const commands = await invoke<Array<{ id: string; name: string; description: string }>>(
    IPC.ListClaudeCommands,
  ).catch(() => []);

  const normalized = commands
    .map((command) => normalizeCliCommand(command))
    .filter((command): command is SlashCommand => command !== null);

  setStore('cliSlashCommands', normalized);
}

export function addCustomSlashCommand(input: {
  name: string;
  description: string;
  template?: string;
}): { ok: true } | { ok: false; reason: 'invalid_name' | 'duplicate' | 'invalid_description' } {
  const normalizedName = normalizeCommandName(input.name);
  if (!/^\/[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/.test(normalizedName)) {
    return { ok: false, reason: 'invalid_name' };
  }

  const id = `custom-slash-${crypto.randomUUID()}`;
  const next = normalizeCustomCommand({
    id,
    name: normalizedName,
    description: input.description,
    template: input.template,
  });

  if (!next.description) {
    return { ok: false, reason: 'invalid_description' };
  }

  const lowerName = next.name.toLowerCase();
  const hasDuplicate = store.customSlashCommands.some((c) => c.name.toLowerCase() === lowerName);
  if (hasDuplicate) {
    return { ok: false, reason: 'duplicate' };
  }

  setStore(
    produce((s) => {
      s.customSlashCommands.push(next);
    }),
  );

  return { ok: true };
}

export function removeCustomSlashCommand(commandId: string): void {
  setStore(
    produce((s) => {
      s.customSlashCommands = s.customSlashCommands.filter((c) => c.id !== commandId);
    }),
  );
}
