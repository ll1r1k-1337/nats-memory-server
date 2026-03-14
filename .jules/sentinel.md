## 2024-05-15 - Prevent Path Traversal in Content-Disposition Filenames
**Vulnerability:** The filename extracted from the `Content-Disposition` header was directly used in `path.resolve()`, allowing path traversal (e.g., `../../../etc/passwd`) if a malicious server sends an evil filename.
**Learning:** Always sanitize filenames from untrusted sources (like external HTTP responses) using `path.basename()` before using them in file system operations. Also, robust regex parsing is required for header values to handle quotes properly.
**Prevention:** Use regex `/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i`, remove wrapping quotes, and sanitize using `path.basename()`.
