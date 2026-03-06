import type { SlashCommand } from '../store/types';

export interface SlashQueryState {
  active: boolean;
  query: string;
  replaceStart: number;
  replaceEnd: number;
}

export function parseSlashQuery(text: string, caretPos: number): SlashQueryState {
  if (caretPos < 0 || caretPos > text.length) {
    return { active: false, query: '', replaceStart: 0, replaceEnd: 0 };
  }

  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);

  if (!firstLine.startsWith('/')) {
    return { active: false, query: '', replaceStart: 0, replaceEnd: 0 };
  }

  if (caretPos > firstLine.length) {
    return { active: false, query: '', replaceStart: 0, replaceEnd: 0 };
  }

  const firstTokenEnd = (() => {
    const spaceIndex = firstLine.indexOf(' ');
    return spaceIndex === -1 ? firstLine.length : spaceIndex;
  })();

  if (caretPos > firstTokenEnd) {
    return { active: false, query: '', replaceStart: 0, replaceEnd: 0 };
  }

  const token = firstLine.slice(0, firstTokenEnd);
  if (!token.startsWith('/')) {
    return { active: false, query: '', replaceStart: 0, replaceEnd: 0 };
  }

  return {
    active: true,
    query: token.slice(1),
    replaceStart: 0,
    replaceEnd: firstTokenEnd,
  };
}

export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase();
  const withRank = commands
    .map((command) => {
      const normalizedName = command.name.toLowerCase();
      const normalizedDescription = command.description.toLowerCase();
      const nameWithoutSlash = normalizedName.startsWith('/')
        ? normalizedName.slice(1)
        : normalizedName;

      let rank = 99;
      if (!normalized) {
        rank = 0;
      } else if (nameWithoutSlash.startsWith(normalized)) {
        rank = 1;
      } else if (normalizedName.includes(normalized)) {
        rank = 2;
      } else if (normalizedDescription.includes(normalized)) {
        rank = 3;
      }

      return { command, rank };
    })
    .filter((item) => item.rank < 99)
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.command.name.localeCompare(b.command.name);
    });

  return withRank.map((item) => item.command);
}

export interface SlashCompletionResult {
  text: string;
  caret: number;
}

export function applySlashCompletion(
  currentText: string,
  command: SlashCommand,
  state: SlashQueryState,
): SlashCompletionResult {
  const prefix = currentText.slice(0, state.replaceStart);
  const suffix = currentText.slice(state.replaceEnd);
  const completedCommand = command.template?.trim() || command.name;

  const space = suffix.startsWith(' ') || suffix.length === 0 ? '' : ' ';
  const text = `${prefix}${completedCommand}${space}${suffix}`;
  const caret = (prefix + completedCommand + space).length;

  return { text, caret };
}
