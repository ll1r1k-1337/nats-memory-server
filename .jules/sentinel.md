## 2024-03-16 - Prevent Path Traversal in File Download
**Vulnerability:** The `downloadFile` utility extracted the filename directly from the `Content-Disposition` header without sanitization, leading to a potential path traversal vulnerability if a malicious server returned a filename like `../../../etc/passwd`.
**Learning:** Even when interacting with external services, filenames provided in headers (`Content-Disposition`) must be treated as untrusted user input, as the remote server could be compromised or malicious.
**Prevention:** Always sanitize filenames extracted from HTTP headers using `path.basename()` to strip directory components and ensure they are safely resolved within the intended target directory.
