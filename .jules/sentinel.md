## 2024-05-15 - Path Traversal in downloadFile
**Vulnerability:** The `downloadFile` function trusted the `filename` parameter extracted from the `Content-Disposition` header without sanitization, leading to a path traversal vulnerability. An attacker or malicious upstream server could provide a filename like `../../../etc/passwd` to write files outside the intended download directory.
**Learning:** Always treat HTTP header data as untrusted input. `path.resolve` does not sanitize path traversal sequences, it resolves them.
**Prevention:** Use `path.basename()` on extracted filenames to strip all directory components and enforce writing strictly to the resolved target directory.
