## 2025-03-20 - Prevent Path Traversal in Download Filename
**Vulnerability:** The `downloadFile` function trusted the `filename` parameter from the `Content-Disposition` HTTP header, passing it directly to `path.resolve()`. This allowed a malicious server to perform a path traversal attack.
**Learning:** Always treat user/server-provided input, especially filenames from HTTP headers, as untrusted.
**Prevention:** Use `path.basename()` (with backslash sanitization) to extract only the final file component, stripping any directory path segments, before using it in file system operations.
