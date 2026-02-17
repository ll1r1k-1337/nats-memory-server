## 2025-02-23 - Path Traversal in Content-Disposition
**Vulnerability:** Path Traversal via `Content-Disposition` header in file download.
**Learning:** The `downloadFile` utility blindly trusted the filename provided in the `Content-Disposition` header, allowing a malicious server (or MITM) to write files outside the intended download directory using path traversal sequences (e.g., `../../../etc/passwd`).
**Prevention:** Always sanitize filenames from external sources (headers, user input) using `path.basename()` to strip directory components. Additionally, verify that the resolved path is within the intended target directory using `path.resolve()` and `.startsWith()`.
