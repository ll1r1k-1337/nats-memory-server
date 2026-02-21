## 2026-02-21 - [CRITICAL] Path Traversal in File Download
**Vulnerability:** The `downloadFile` function extracted the filename directly from the `Content-Disposition` header without sanitization, allowing a malicious server to overwrite files outside the intended directory via directory traversal characters (e.g., `../../etc/passwd`).
**Learning:** `path.resolve` does not sanitize paths; it resolves them. Trusting external input (even headers) for file paths is dangerous.
**Prevention:** Always use `path.basename()` on filenames extracted from external sources before using them in file system operations.
