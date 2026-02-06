## 2026-02-06 - Path Traversal in downloadFile
**Vulnerability:** The `downloadFile` utility blindly trusted the `filename` from `Content-Disposition` header, allowing path traversal via `../` sequences.
**Learning:** Utilities intended for internal use (like downloading dependencies) can become vectors for attack if they process external inputs (like headers) insecurely. `path.resolve` does NOT sanitize input.
**Prevention:** Always use `path.basename()` on filenames derived from external sources before using them in file system operations.
