## 2026-02-19 - Path Traversal in File Download
**Vulnerability:** The `downloadFile` function used the `Content-Disposition` filename directly in `path.resolve` without sanitization. This allowed path traversal (Zip Slip) attacks if the server provided a malicious filename like `../../evil.txt`.
**Learning:** `Content-Disposition` filenames are untrusted user input and must be sanitized. `path.resolve` is vulnerable when combined with unsanitized relative paths.
**Prevention:** Always use `path.basename()` on filenames from external sources before using them in file system operations. Explicitly verify the resolved path is within the target directory using `.startsWith()`.
