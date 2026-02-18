## 2024-05-23 - [Path Traversal in Download]
**Vulnerability:** The `downloadFile` function blindly trusted the `Content-Disposition` header's filename parameter, allowing path traversal (Zip Slip/File Write) if the server returned a malicious filename (e.g., `../../etc/passwd`).
**Learning:** Relying on external input (even headers from a requested URL) for file paths is dangerous. `path.resolve` does not sandbox paths.
**Prevention:** Always sanitize filenames using `path.basename()` before using them in file system operations. Additionally, verify that the resolved path is within the intended directory using `startsWith`.
