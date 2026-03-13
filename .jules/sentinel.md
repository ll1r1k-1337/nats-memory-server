## 2026-03-13 - Path Traversal in File Download
**Vulnerability:** Path traversal (CWE-22) in `downloadFile` due to unsanitized `Content-Disposition` filename.
**Learning:** Filenames extracted from HTTP headers like `Content-Disposition` must be treated as untrusted user input, as malicious servers can inject traversal sequences (e.g., `../../etc/passwd`).
**Prevention:** Always use `path.basename()` on extracted filenames to strip directory components and resolve them against a trusted base directory before using them in file system operations.
