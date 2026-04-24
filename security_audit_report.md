# Security Audit Report: pt-cli

## Executive Summary
A security audit was performed on the `pt-cli` project. The audit identified one **Critical** vulnerability related to command injection, one **Medium** risk related to path traversal, and some lower-risk configuration issues.

## Vulnerability Analysis

### 1. Command Injection (CRITICAL)
- **Location**: `src/postconfig.ts` (Line 48)
- **Description**: Post-configuration commands from template definitions are executed via `execSync` with shell interpolation and redundant manual shell wrapping.
- **Impact**: An attacker can create a malicious template that, when used for project initialization, executes arbitrary commands on the user's system.
- **Remediation**: Remove redundant shell wrapping and use a safer execution method. Implement a mandatory "dry-run" or explicit confirmation showing the exact command being executed.

### 2. Path Traversal (MEDIUM)
- **Location**: `src/init.ts` (Lines 105, 110) and `src/substitute.ts` (Line 33)
- **Description**: Folder and file names from template configurations are joined using `path.join` without sanitization.
- **Impact**: A malicious template could specify folder or file names containing `..` to write files outside the intended project directory.
- **Remediation**: Validate that all folder and file names do not contain path traversal sequences (`..`, `/`, `\`).

### 3. Automatic `chmod +x` (LOW)
- **Location**: `src/init.ts` (Line 83)
- **Description**: Files with certain extensions (`.sh`, `.py`, etc.) are automatically marked as executable.
- **Impact**: While it requires the user to run the tool, it could lead to accidental execution of untrusted scripts.
- **Remediation**: Add a warning or prompt when files are being marked as executable.

---

## Remediation Plan

### Immediate Actions (Today)
1. **Fix Command Injection**: Refactor `runPostConfig` in `src/postconfig.ts` to execute commands more safely and remove redundant shell calls.
2. **Path Traversal Protection**: Add a utility to sanitize paths in `src/config.ts` and apply it in `src/init.ts` and `src/substitute.ts`.

### Planned Hardening
1. Add a `--dry-run` flag to `pt init` to show all actions without executing them.
2. Implement signature verification or trust-based warnings for external templates if shared templates are introduced.
