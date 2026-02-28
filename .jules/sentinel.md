## 2024-03-01 - Path Traversal in File Download
**Vulnerability:** The `downloadFile` function extracted the filename from the `Content-Disposition` header and used it directly in `path.resolve()`, allowing an attacker-controlled server to write files outside the intended directory via path traversal (e.g., `../../../etc/passwd`).
**Learning:** Always sanitize filenames extracted from external sources (like HTTP headers) using `path.basename()` before using them in file system operations.
**Prevention:** Use a robust regex to parse `Content-Disposition` and apply `path.basename()` to strip any directory components from the filename.
