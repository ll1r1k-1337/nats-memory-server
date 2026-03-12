## 2024-03-12 - Fix path traversal vulnerability in Content-Disposition header
**Vulnerability:** The filename extracted from the Content-Disposition header in file downloads was passed directly to path.resolve without sanitization. An attacker controlling the download URL could return a filename like "../../../etc/passwd" or "/etc/passwd", leading to arbitrary file write outside the intended directory.
**Learning:** Path components parsed from remote server headers must always be treated as untrusted input.
**Prevention:** Always sanitize downloaded filenames by extracting only the base name using `path.basename()` before resolving them against the destination directory.
