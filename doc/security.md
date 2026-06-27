# Security Guide

## Overview

`pt-cli` implements a multi-layered security model to protect users when running post-config commands and downloading remote templates. The system uses a warning-based approach rather than strict blocking, allowing legitimate workflows while providing clear warnings for potentially dangerous operations.

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

- **`warn`** (default): Warning-based approach with cancellation prompts
- **`strict`**: More conservative defaults, enabled by default for new installations

### Trusted Sources

When downloading templates from remote URLs, `pt-cli` verifies the source against the `trustedSources` list. Untrusted sources trigger a warning and require explicit user confirmation before proceeding.

## Command Security

### Absolute Blocks (Never Allowed)

The following commands are **always blocked** regardless of security level:

- `sudo`, `su`, `su -` (privilege escalation)
- `dd`, `mkfs`, `fdisk` (disk operations)
- `rm -rf /`, `rm -r --no-preserve-root` (massive deletion)
- `eval`, `exec`, `source` (code execution)

### Dangerous Commands (Warning Only)

The following commands trigger a **5-second countdown** with CTRL+C cancellation:

- `curl`, `wget`, `wget -O` (remote downloads)
- `bash`, `sh`, `python`, `python3`, `node -e`, `node -p` (script execution)
- `chmod 777`, `chmod -R`, `chmod +x`, `chmod 755`, `chmod 644` (permission changes)

**Example interaction:**

```bash
⚠️  WARNING: This command may be dangerous: npm install
   Press CTRL+C to cancel, or wait 5s to continue...
```

### Rate Limiting

- **50 commands per run**: Prevents runaway command execution
- If limit is reached, subsequent commands are skipped with a warning

### Execution Timeout

- **30 seconds per command**: Prevents hung processes
- Timed-out commands are logged and skipped

## Remote Template Security

When downloading templates from remote URLs:

1. **Source Verification**: Checks against `trustedSources` list
2. **File Size Validation**: Maximum 50MB download limit
3. **Archive Extraction**: Extracts to secure temporary directory
4. **Audit Logging**: All downloads are logged with timestamps and outcomes

## Audit Logging

All security events are logged to `~/.pt/security-audit.log`:

```
2026-06-27T10:01:23.456Z [WARNING] dangerous_command: npm install | type: javascript | status: warning
2026-06-27T10:01:24.123Z [BLOCKED] command_blocked: sudo rm -rf / | type: all | status: blocked
2026-06-27T10:01:25.789Z [INFO] template_loaded: https://github.com/user/template | type: remote | status: success
```

## Security Best Practices

### For Users

1. **Review post-config tasks**: Always review commands before executing
2. **Use trusted sources**: Only download templates from known repositories
3. **Monitor audit logs**: Check `~/.pt/security-audit.log` for suspicious activity
4. **Update regularly**: Keep `pt-cli` updated for latest security improvements

### For Template Authors

1. **Avoid dangerous commands**: Don't include `sudo`, `rm -rf`, or privilege escalation in templates
2. **Use safe defaults**: Prefer `npm install` over custom scripts
3. **Provide clear descriptions**: Explain what each post-config task does
4. **Test thoroughly**: Verify templates work in isolated environments

## Troubleshooting

### Security Events Not Logging

1. Check write permissions to `~/.pt/` directory
2. Verify `enableAuditLogging: true` in config
3. Check for disk space issues

### Commands Blocked Unexpectedly

1. Check if command matches absolute blocklist
2. Review security policy configuration
3. Consult audit log for specific reasons

### Remote Template Download Failed

1. Verify URL is in `trustedSources` list
2. Check network connectivity
3. Verify file size is under 50MB limit
4. Check for valid archive format

## Security Policy Reference

| Setting              | Type    | Default | Description                          |
|---------------------|---------|---------|--------------------------------------|
| `securityLevel`     | string  | `"warn"`| Security enforcement level           |
| `trustedSources`    | array   | []      | List of trusted template sources     |
| `maxExecutionTime`  | number  | 30000   | Max seconds per command (30s default)|
| `maxCommandsPerRun` | number  | 50      | Rate limit per init session          |
| `enableAuditLogging`| boolean | true    | Enable security event logging        |
