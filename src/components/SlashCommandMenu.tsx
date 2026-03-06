import { For } from 'solid-js';
import { theme } from '../lib/theme';
import type { SlashCommand } from '../store/types';

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  activeIndex: number;
  style?: Record<string, string>;
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandMenu(props: SlashCommandMenuProps) {
  return (
    <div class="slash-command-menu" role="listbox" aria-label="Slash commands" style={props.style}>
      <For each={props.commands}>
        {(command, index) => {
          const active = () => index() === props.activeIndex;
          return (
            <button
              type="button"
              role="option"
              aria-selected={active()}
              class={`slash-command-item${active() ? ' active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                props.onSelect(command);
              }}
            >
              <div class="slash-command-item-main">
                <span class="slash-command-name">{command.name}</span>
                <span
                  class="slash-command-source"
                  style={{
                    color: command.source === 'custom' ? theme.accent : theme.fgSubtle,
                  }}
                >
                  {command.source === 'custom'
                    ? 'custom'
                    : command.source === 'cli'
                      ? 'cli'
                      : 'built-in'}
                </span>
              </div>
              <span class="slash-command-desc">{command.description}</span>
            </button>
          );
        }}
      </For>
    </div>
  );
}
