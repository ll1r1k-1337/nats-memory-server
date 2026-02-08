## 2026-02-08 - Path Traversal in File Download
**Vulnerability:** The `downloadFile` function trusted the `Content-Disposition` header's filename directly, allowing path traversal (e.g., `../../etc/passwd`).
**Learning:** Never trust filenames from external sources, even if the URL is trusted. `path.resolve` does not sanitize input.
**Prevention:** Always use `path.basename()` on filenames from external sources before using them in file system operations.
