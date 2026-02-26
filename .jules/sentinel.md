## 2025-05-23 - Path Traversal in File Download
**Vulnerability:** The `downloadFile` function blindly trusted the `Content-Disposition` header filename, allowing path traversal (e.g., `../../etc/passwd`).
**Learning:** Developers assumed remote server filenames are safe or already sanitized, but they can be malicious.
**Prevention:** Always sanitize filenames from external sources using `path.basename()` before using them in file system operations.
