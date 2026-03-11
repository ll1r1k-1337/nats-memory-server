## 2025-03-11 - Path Traversal in File Download
**Vulnerability:** Path traversal risk because `downloadFile` parses `content-disposition` filename header and uses it directly in `path.resolve()`.
**Learning:** The previous implementation failed to strip directory components from the filename derived from network responses.
**Prevention:** Always use `path.basename()` to sanitize user or external input before using it to resolve file paths.
