## 2026-03-24 - Command Injection Risk in child_process.spawn
**Vulnerability:** User-controlled binPath and arguments were passed directly to child_process.spawn without validation, risking command injection.
**Learning:** When spawning processes, ensure the executable basename and all arguments are validated against strict allowlists (e.g., alphanumeric and safe characters) to prevent malicious commands from executing.
**Prevention:** Always validate and sanitize user-provided configuration values before passing them to process execution functions. Fail securely without leaking internal state on error.
## 2026-03-24 - Path Traversal via Content-Disposition Header
**Vulnerability:** The application extracted the filename directly from the Content-Disposition HTTP header and used it in path.resolve() without sanitization, allowing a malicious server to overwrite arbitrary files using path traversal characters like ../.
**Learning:** User-provided filenames, including those received from external servers via HTTP headers, must never be trusted. They must be aggressively sanitized to remove all directory components before being used in file system operations.
**Prevention:** Always apply path.basename() (after normalizing backslashes for cross-platform safety) and strip extraneous characters (like quotes) when extracting filenames from untrusted sources.
