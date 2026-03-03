## 2024-03-03 - Path Traversal in File Download
**Vulnerability:** The `downloadFile` function uses `path.resolve(dir, fileName)` where `fileName` is extracted from the `Content-Disposition` header sent by the remote server. This allows a malicious server to respond with `Content-Disposition: attachment; filename=../../../tmp/evil.sh` and write arbitrary files anywhere on the system.
**Learning:** `Content-Disposition` headers are untrusted input. Directly concatenating or resolving them against a target directory leads to path traversal vulnerabilities.
**Prevention:** Always use `path.basename()` to sanitize filenames extracted from `Content-Disposition` or other external sources before using them in file system operations.
