## 2026-02-07 - [Path Traversal in downloadFile]
**Vulnerability:** The `downloadFile` utility blindly trusted the `filename` parameter from the `Content-Disposition` header without sanitization. This allowed a malicious server (or a compromised URL) to write files outside the intended download directory via path traversal (e.g., `../../../etc/passwd`).
**Learning:** Utilities that download files based on server responses must always sanitize the filename, even if the URL source is trusted (e.g. GitHub releases), because the utility might be reused elsewhere or the source might be compromised/redirected.
**Prevention:** Always use `path.basename()` on filenames extracted from headers or external sources before using them in file system operations.
