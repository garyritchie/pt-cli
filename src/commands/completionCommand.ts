import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getConfigPath } from '../config.js';

export function getTemplatesForCompletion(): string[] {
  try {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) {
      return [];
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    if (!content.trim()) {
      return [];
    }
    const parsed = YAML.parse(content);
    if (!parsed || !parsed.templates || typeof parsed.templates !== 'object') {
      return [];
    }
    return Object.keys(parsed.templates);
  } catch {
    return [];
  }
}

export function generateBashCompletion(): string {
  return `# Bash completion for pt
_pt_completions() {
  local cur prev words cword
  if declare -F _init_completion >/dev/null 2>&1; then
    _init_completion || return
  else
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    words=("\${COMP_WORDS[@]}")
    cword=$COMP_CWORD
  fi

  local commands="learn update init config ignore variables default-post-config add remove rm security-response completion"

  # Complete top-level command or global flags
  if [[ $cword -eq 1 ]]; then
    if [[ "$cur" == -* ]]; then
      COMPREPLY=( $(compgen -W "-v --version -h --help" -- "$cur") )
    else
      COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
    fi
    return 0
  fi

  local cmd="\${words[1]}"

  case "$cmd" in
    learn)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--ignore -y --yes --name --desc --json --allow-untrusted -h --help" -- "$cur") )
      fi
      ;;
    update)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--ignore -y --yes --desc --no-diff -h --help" -- "$cur") )
      elif [[ $cword -eq 2 ]]; then
        local templates
        templates=$(pt completion --templates 2>/dev/null)
        COMPREPLY=( $(compgen -W "$templates" -- "$cur") )
      fi
      ;;
    init)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "-f --file --skip-post-config --dry-run -y --yes --vars -h --help" -- "$cur") )
      elif [[ $cword -eq 2 ]]; then
        local templates
        templates=$(pt completion --templates 2>/dev/null)
        COMPREPLY=( $(compgen -W "$templates" -- "$cur") )
      fi
      ;;
    config)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--json -h --help" -- "$cur") )
      elif [[ $cword -eq 2 ]]; then
        local templates
        templates=$(pt completion --templates 2>/dev/null)
        COMPREPLY=( $(compgen -W "$templates" -- "$cur") )
      fi
      ;;
    ignore)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--set -h --help" -- "$cur") )
      fi
      ;;
    variables)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--set --json --delete -h --help" -- "$cur") )
      fi
      ;;
    default-post-config)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "--set --json -h --help" -- "$cur") )
      fi
      ;;
    add)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "-f --file -h --help" -- "$cur") )
      fi
      ;;
    remove|rm)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "-y --yes -h --help" -- "$cur") )
      elif [[ $cword -eq 2 ]]; then
        local templates
        templates=$(pt completion --templates 2>/dev/null)
        COMPREPLY=( $(compgen -W "$templates" -- "$cur") )
      fi
      ;;
    completion)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "-h --help" -- "$cur") )
      elif [[ $cword -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )
      fi
      ;;
    security-response)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "-h --help" -- "$cur") )
      fi
      ;;
  esac
}

complete -F _pt_completions pt
`;
}

export function generateZshCompletion(): string {
  return `#compdef pt

_pt_templates() {
  local -a templates
  templates=(\${(f)"$(pt completion --templates 2>/dev/null)"})
  if [[ \${#templates[@]} -gt 0 ]]; then
    _describe -t templates 'template' templates
  fi
}

_pt() {
  local context state state_policy
  typeset -A opt_args

  _arguments -C \\
    '(-v --version)'{-v,--version}'[output the version number]' \\
    '(-h --help)'{-h,--help}'[display help for command]' \\
    '1: :->command' \\
    '*:: :->args'

  case $state in
    command)
      local -a commands
      commands=(
        'learn:Learn a project structure from an existing directory'
        'update:Update an existing template with new structure/files'
        'init:Initialize a new project from a learned template'
        'config:Show current config location and list templates, or export a specific template'
        'ignore:View or set global ignore patterns (comma-separated)'
        'variables:View or set global variables (comma-separated key=value)'
        'default-post-config:View or set default post-config tasks'
        'add:Import/add a template from a JSON string or file'
        'remove:Remove a learned template from the config'
        'rm:Remove a learned template from the config'
        'security-response:Handle security response from GUI'
        'completion:Generate shell completion script'
      )
      _describe -t commands 'pt command' commands
      ;;
    args)
      case $words[1] in
        learn)
          _arguments \\
            '--ignore=[Folder patterns to ignore]:patterns:' \\
            '(-y --yes)'{-y,--yes}'[Automatically confirm prompts]' \\
            '--name=[Template name]:name:' \\
            '--desc=[Template description]:description:' \\
            '--json[Output template structure as JSON for sharing instead of saving]' \\
            '--allow-untrusted[Bypass the trusted-source check for remote URLs]' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:path:_files -/'
          ;;
        update)
          _arguments \\
            '--ignore=[Folder patterns to ignore]:patterns:' \\
            '(-y --yes)'{-y,--yes}'[Automatically confirm prompts]' \\
            '--desc=[Template description]:description:' \\
            '--no-diff[Disable additive mode, show full list]' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:template:_pt_templates' \\
            '2:sourcePath:_files -/'
          ;;
        init)
          _arguments \\
            '(-f --file)'{-f,--file}'[Initialize directly from a JSON template file]:file:_files' \\
            '--skip-post-config[Skip running post-config tasks]' \\
            '--dry-run[Show what would be created without making changes]' \\
            '(-y --yes)'{-y,--yes}'[Automatically answer yes to prompts]' \\
            '--vars=[Comma-separated key=value variables]:variables:' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:template:_pt_templates' \\
            '2:destPath:_files -/'
          ;;
        config)
          _arguments \\
            '--json[Output config or specific template as JSON]' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:template:_pt_templates'
          ;;
        ignore)
          _arguments \\
            '--set[Set the ignore patterns to the provided value]' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:patterns:'
          ;;
        variables)
          _arguments \\
            '--set[Set the variables to the provided pairs]' \\
            '--json=[Set variables via JSON string or file]:data:' \\
            '--delete=[Delete a specific global variable]:key:' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:pairs:'
          ;;
        default-post-config)
          _arguments \\
            '--set[Set the default post-config tasks via JSON]' \\
            '--json=[JSON string or file containing tasks array]:data:' \\
            '(-h --help)'{-h,--help}'[display help for command]'
          ;;
        add)
          _arguments \\
            '(-f --file)'{-f,--file}'[Path to JSON file containing template data]:file:_files' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:name:' \\
            '2:json:'
          ;;
        remove|rm)
          _arguments \\
            '(-y --yes)'{-y,--yes}'[Automatically confirm removal]' \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:template:_pt_templates'
          ;;
        security-response)
          _arguments \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:response:'
          ;;
        completion)
          _arguments \\
            '(-h --help)'{-h,--help}'[display help for command]' \\
            '1:shell:(bash zsh fish)'
          ;;
      esac
      ;;
  esac
}

if [[ "$(basename -- "$0")" != "_pt" ]]; then
  compdef _pt pt 2>/dev/null || true
fi
`;
}

export function generateFishCompletion(): string {
  return `# Fish completion for pt

function __fish_pt_needs_command
    set -l cmd (commandline -opc)
    if [ (count $cmd) -eq 1 ]
        return 0
    end
    return 1
end

function __fish_pt_using_command
    set -l cmd (commandline -opc)
    if [ (count $cmd) -gt 1 ]
        if [ "$argv[1]" = "$cmd[2]" ]
            return 0
        end
    end
    return 1
end

function __fish_pt_templates
    pt completion --templates 2>/dev/null
end

# Global options
complete -c pt -n '__fish_pt_needs_command' -s v -l version -d 'output the version number'
complete -c pt -n '__fish_pt_needs_command' -s h -l help -d 'display help for command'

# Commands
complete -c pt -n '__fish_pt_needs_command' -a learn -d 'Learn a project structure from an existing directory'
complete -c pt -n '__fish_pt_needs_command' -a update -d 'Update an existing template with new structure/files'
complete -c pt -n '__fish_pt_needs_command' -a init -d 'Initialize a new project from a learned template'
complete -c pt -n '__fish_pt_needs_command' -a config -d 'Show current config location and list templates, or export a specific template'
complete -c pt -n '__fish_pt_needs_command' -a ignore -d 'View or set global ignore patterns (comma-separated)'
complete -c pt -n '__fish_pt_needs_command' -a variables -d 'View or set global variables (comma-separated key=value)'
complete -c pt -n '__fish_pt_needs_command' -a default-post-config -d 'View or set default post-config tasks'
complete -c pt -n '__fish_pt_needs_command' -a add -d 'Import/add a template from a JSON string or file'
complete -c pt -n '__fish_pt_needs_command' -a remove -d 'Remove a learned template from the config'
complete -c pt -n '__fish_pt_needs_command' -a rm -d 'Remove a learned template from the config'
complete -c pt -n '__fish_pt_needs_command' -a security-response -d 'Handle security response from GUI'
complete -c pt -n '__fish_pt_needs_command' -a completion -d 'Generate shell completion script'

# learn
complete -c pt -n '__fish_pt_using_command learn' -l ignore -d 'Folder patterns to ignore (comma-separated)'
complete -c pt -n '__fish_pt_using_command learn' -s y -l yes -d 'Automatically confirm prompts'
complete -c pt -n '__fish_pt_using_command learn' -l name -d 'Template name (skip prompt)'
complete -c pt -n '__fish_pt_using_command learn' -l desc -d 'Template description (skip prompt)'
complete -c pt -n '__fish_pt_using_command learn' -l json -d 'Output template structure as JSON for sharing instead of saving'
complete -c pt -n '__fish_pt_using_command learn' -l allow-untrusted -d 'Bypass the trusted-source check for remote URLs'

# update
complete -c pt -n '__fish_pt_using_command update' -a '(__fish_pt_templates)' -d 'Template name'
complete -c pt -n '__fish_pt_using_command update' -l ignore -d 'Folder patterns to ignore (comma-separated)'
complete -c pt -n '__fish_pt_using_command update' -s y -l yes -d 'Automatically confirm prompts'
complete -c pt -n '__fish_pt_using_command update' -l desc -d 'Template description (skip prompt)'
complete -c pt -n '__fish_pt_using_command update' -l no-diff -d 'Disable additive mode, show full list'

# init
complete -c pt -n '__fish_pt_using_command init' -a '(__fish_pt_templates)' -d 'Template name'
complete -c pt -n '__fish_pt_using_command init' -s f -l file -d 'Initialize directly from a JSON template file without adding it to local config'
complete -c pt -n '__fish_pt_using_command init' -l skip-post-config -d 'Skip running post-config tasks'
complete -c pt -n '__fish_pt_using_command init' -l dry-run -d 'Show what would be created without making changes'
complete -c pt -n '__fish_pt_using_command init' -s y -l yes -d 'Automatically answer yes to prompts'
complete -c pt -n '__fish_pt_using_command init' -l vars -d 'Comma-separated key=value variables'

# config
complete -c pt -n '__fish_pt_using_command config' -a '(__fish_pt_templates)' -d 'Template name'
complete -c pt -n '__fish_pt_using_command config' -l json -d 'Output config or specific template as JSON'

# ignore
complete -c pt -n '__fish_pt_using_command ignore' -l set -d 'Set the ignore patterns to the provided value'

# variables
complete -c pt -n '__fish_pt_using_command variables' -l set -d 'Set the variables to the provided pairs'
complete -c pt -n '__fish_pt_using_command variables' -l json -d 'Set variables via JSON string or file'
complete -c pt -n '__fish_pt_using_command variables' -l delete -d 'Delete a specific global variable'

# default-post-config
complete -c pt -n '__fish_pt_using_command default-post-config' -l set -d 'Set the default post-config tasks via JSON'
complete -c pt -n '__fish_pt_using_command default-post-config' -l json -d 'JSON string or file containing tasks array'

# add
complete -c pt -n '__fish_pt_using_command add' -s f -l file -d 'Path to JSON file containing template data'

# remove / rm
complete -c pt -n '__fish_pt_using_command remove' -a '(__fish_pt_templates)' -d 'Template name'
complete -c pt -n '__fish_pt_using_command remove' -s y -l yes -d 'Automatically confirm removal'
complete -c pt -n '__fish_pt_using_command rm' -a '(__fish_pt_templates)' -d 'Template name'
complete -c pt -n '__fish_pt_using_command rm' -s y -l yes -d 'Automatically confirm removal'

# completion
complete -c pt -n '__fish_pt_using_command completion' -a 'bash zsh fish' -d 'Shell'
`;
}

export function generateShellScript(shell: string): string {
  switch (shell.toLowerCase()) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'fish':
      return generateFishCompletion();
    default: {
      const supported = ['bash', 'zsh', 'fish'];
      throw new Error(`Unsupported shell: ${shell}. Supported: ${supported.join(', ')}`);
    }
  }
}

export function generateCompletion(shell: string): string {
  return generateShellScript(shell);
}

export async function completionCommand(shellArg?: string, options?: { templates?: boolean }): Promise<void> {
  if (options?.templates || shellArg === '--templates' || shellArg === '_templates') {
    const templates = getTemplatesForCompletion();
    if (templates.length > 0) {
      console.log(templates.join('\n'));
    }
    return;
  }

  if (!shellArg) {
    console.error('Error: Please specify a shell (bash, zsh, fish).');
    process.exit(1);
  }

  try {
    const script = generateCompletion(shellArg);
    console.log(script);
  } catch (err: any) {
    console.error(err.message || String(err));
    process.exit(1);
  }
}

// Allow direct execution via tsx src/commands/completionCommand.ts <shell>
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const shell = process.argv[2];
  if (shell === '--templates' || shell === '_templates') {
    completionCommand(shell, { templates: true });
  } else {
    completionCommand(shell);
  }
}
