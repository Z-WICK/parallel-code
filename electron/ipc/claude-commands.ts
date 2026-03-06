import { execFile } from 'child_process';

const CLAUDE_HELP_TIMEOUT_MS = 3000;
const MAX_BUFFER = 1024 * 1024;
const COMMAND_NAME_REGEX = /^\/[a-zA-Z0-9][a-zA-Z0-9:_.-]*$/;

export interface ClaudeCommand {
  id: string;
  name: string;
  description: string;
  source: 'cli';
}

export function parseClaudeHelpCommands(helpText: string): ClaudeCommand[] {
  const byName = new Map<string, ClaudeCommand>();

  for (const rawLine of helpText.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('/')) continue;

    const [rawName, ...rest] = line.split(/\s+/);
    const name = rawName?.trim() ?? '';
    if (!COMMAND_NAME_REGEX.test(name)) continue;

    const description = rest.join(' ').trim() || 'Claude CLI command';
    const lower = name.toLowerCase();
    if (!byName.has(lower)) {
      byName.set(lower, {
        id: `cli-${lower.slice(1)}`,
        name,
        description,
        source: 'cli',
      });
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listClaudeCommands(): Promise<ClaudeCommand[]> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        'claude',
        ['--help'],
        {
          timeout: CLAUDE_HELP_TIMEOUT_MS,
          maxBuffer: MAX_BUFFER,
          encoding: 'utf8',
        },
        (error, out) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(out);
        },
      );
    });

    return parseClaudeHelpCommands(stdout);
  } catch {
    return [];
  }
}
