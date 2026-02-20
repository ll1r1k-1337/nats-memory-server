# Sentinel's Journal

## 2026-02-20 - Path Traversal in File Downloads
**Vulnerability:** The `downloadFile` utility blindly trusted the `filename` parameter from the `Content-Disposition` header, allowing path traversal (e.g., `../../etc/passwd`).
**Learning:** External inputs like HTTP headers (specifically `Content-Disposition`) must be treated as untrusted and sanitized before being used in file system operations.
**Prevention:** Always sanitize filenames derived from external sources using `path.basename()` to strip directory components, ensuring the file is written only to the intended directory.
