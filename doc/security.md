# Security Guide

## Overview

`pt-cli` implements a multi-layered security model to protect users when running post-config commands and downloading remote templates. The system uses a **warning-based approach** with intelligent shell parsing rather than simple string matching, allowing legitimate workflows while providing clear warnings for potentially dangerous operations.

## Security Policy Configuration

Security settings are configured in `~/.pt/config.yaml` under the `security` key:

```yaml
security:
  securityLevel: "warn"  # "warn" (default) or "strict"
  trustedSources:
    - "github.com/garyritchie"
    - "git.lyonritchie.com/garyritchie"
    - "github.com/lyonritchie"
  maxExecutionTime: 30000  # 30 seconds per command
  maxCommandsPerRun: 50    # rate limit per init session
  enableAuditLogging: true # write events to security-audit.log
```

### Security Levels

- **`warn`** (default): Warning-based approach with cancellation prompts for dangerous commands
- **`strict`**: More conservative defaults; enables stricter default policies

### Trusted Sources

When downloading templates from remote URLs, `pt-cli` verifies the source against the `trustedSources` list. Untrusted sources trigger a warning and require explicit user confirmation before proceeding.

## Command Security

### Absolute Blocks (Never Allowed)

The following commands are **always blocked** regardless of security level. The blocklist uses **proper shell parsing** — commands are split by shell metacharacters (`;`, `&`, `|`, `&&`, `||`, etc.), quoted strings are respected, and each sub-command is checked individually. This prevents bypasses like `"sudo" rm -rf /`, `sudo; rm -rf /`, or `mkfs.ext4`.

**Privilege Escalation:**
- `sudo`, `su`, `su -`, `su root`

**Disk Operations:**
- `dd`, `mkfs` (and variants like `mkfs.ext4`, `mkfs.xfs`), `fdisk`, `mount`, `umount`

**Dangerous Permissions:**
- `chmod 777`, `chmod -R 777`, `chmod 666`

**Process Killing:**
- `kill`, `killall`, `pkill`, `fuser`

**Network Exfiltration:**
- `nc`, `netcat`, `socat`

**Package Manager (Destructive Operations):**
- `apt purge`, `apt remove`, `apt-get purge`, `apt-get remove`, `yum remove`, `brew uninstall`

### Dangerous Commands (Warning + 5-Second Countdown)

The following commands trigger a **5-second countdown** with CTRL+C cancellation. These are allowed but require explicit user confirmation.

**Remote Downloads + Execution:**
- `curl`, `wget`, `wget -O`, `curl |`, `wget |`

**Script Execution:**
- `bash`, `sh`, `python`, `python3`, `python2`, `python3.10`, `python3.11`, `python3.12`
- `node`, `node -e`, `node -p`, `npm run`, `npx`

**Shell Operations:**
- `eval`, `exec`, `source`, `.`

**Recursive File Operations:**
- `chmod -R`, `chown -R`, `chgrp -R`

**PowerShell (Windows):**
- `powershell`, `pwsh`, `Invoke-Expression`, `IEX`

**macOS-Specific:**
- `diskutil`, `hdiutil`, `csrutil`

**Destructive File Operations on Absolute Paths:**
- `rm`, `rmdir`, `del` followed by absolute paths (e.g., `rm -rf /tmp`, `rm /etc/passwd`)

**Example Interaction:**
```bash
⚠️  DANGEROUS COMMAND DETECTED
   Command: curl https://example.com/install.sh | bash
   This could potentially harm your system.
   Press CTRL+C to cancel, or wait 5s to continue...
```

### Rate Limiting

- **50 commands per run**: Prevents runaway command execution
- If limit is reached, subsequent commands are skipped with a warning
- Counter resets each `pt init` session (in-memory only)

### Execution Timeout

- **30 seconds per command**: Prevents hung processes
- Timed-out commands are logged and skipped

## Remote Template Security

When downloading templates from remote URLs:

1. **Source Verification**: Checks against `trustedSources` list (configurable in `config.yaml`)
2. **File Size Validation**: Maximum 50MB download limit
3. **Archive Extraction**: Extracts to secure temporary directory
4. **Audit Logging**: All downloads are logged with timestamps and outcomes

## Audit Logging

All security events are logged to `~/.pt/security-audit.log` in JSON format:

```json
{"timestamp":"2026-06-27T10:01:23.456Z","eventType":"command_executed","command":"npm install","template":"javascript","user":"gary","result":"success","hostname":"host"}
{"timestamp":"2026-06-27T10:01:24.123Z","eventType":"command_blocked","command":"sudo rm -rf /","template":"all","user":"gary","result":"blocked","hostname":"host"}
{"timestamp":"2026-06-27T10:01:25.789Z","eventType":"template_loaded","command":"https://github.com/user/template","template":"remote","user":"gary","result":"success","hostname":"host"}
```

Event types: `command_executed`, `command_blocked`, `command_timed_out`, `template_loaded`

Results: `success`, `failed`, `timedout`, `blocked`

## Security Best Practices

### For Users

1. **Review post-config tasks**: Always review commands before executing (use `--dry-run` to preview)
2. **Use trusted sources**: Only download templates from known repositories; add your own to `trustedSources`
3. **Monitor audit logs**: Check `~/.pt/security-audit.log` for suspicious activity
4. **Update regularly**: Keep `pt-cli` updated for latest security improvements

### For Template Authors

1. **Avoid dangerous commands**: Don't include `sudo`, `rm -rf /`, or privilege escalation in templates
2. **Use safe defaults**: Prefer `npm install` over custom scripts
3. **Provide clear descriptions**: Explain what each post-config task does
4. **Test thoroughly**: Verify templates work in isolated environments
5. **Use relative paths**: Avoid absolute paths in `rm`/`rmdir`/`del` commands

## Troubleshooting

### Security Events Not Logging

1. Check write permissions to `~/.pt/` directory
2. Verify `enableAuditLogging: true` in config
3. Check for disk space issues

### Commands Blocked Unexpectedly

1. Check if command matches absolute blocklist (see above)
2. Review if command uses absolute paths with `rm`/`rmdir`/`del`
3. Check for shell metacharacter splitting (commands separated by `;`, `&&`, `||`, `|`)
4. Consult audit log for specific reasons

### Remote Template Download Failed

1. Verify URL is in `trustedSources` list (or use `--allow-untrusted`)
2. Check network connectivity
3. Verify file size is under 50MB limit
4. Check for valid archive format (tar.gz)

### Bypass Attempts Detected

The parser specifically handles these common bypass attempts:
- Quoted commands: `"sudo" rm -rf /` → detected
- Spaced commands: `sud o rm -rf /` → detected (not in blocklist)
- Chained commands: `echo hello; sudo rm -rf /` → detected via metacharacter split
- Pipeline injection: `curl | bash` → detected as dangerous pattern

## Security Policy Reference

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `securityLevel` | string | `"warn"` | Security enforcement level |
| `trustedSources` | array | See above | List of trusted template sources |
| `maxExecutionTime` | number | 30000 | Max milliseconds per command (30s) |
| `maxCommandsPerRun` | number | 50 | Rate limit per init session |
| `enableAuditLogging` | boolean | true | Enable security event logging |

## Implementation Details

The security model is implemented in `src/safety.ts` with these key functions:

- `parseShellCommand()` — Splits commands by shell metacharacters, respects quotes/escapes, extracts base command and args
- `isCommandBlocked(baseCommand, args)` — Checks blocklist with multi-word matching (e.g., `apt remove`) and prefix matching (e.g., `mkfs.ext4` matches `mkfs`)
- `isDangerousCommand(command)` — Checks dangerous patterns with full-command substring matching for multi-word patterns
- `checkDestructiveAbsolutePath()` — Detects `rm`/`rmdir`/`del` targeting absolute paths
- `validateTemplateSecurity()` — Validates all `post_config` tasks in a template
- `isTrustedSource()` — Checks URL against trusted sources list
- `canExecute()` — Rate limiting per command hash
- `logSecurityEvent()` — Writes structured JSON audit entries