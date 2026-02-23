## 2026-02-23 - Path Traversal in File Download
**Vulnerability:** Found a path traversal vulnerability in `src/utils/download-file.ts` where `Content-Disposition` filenames were used directly in `path.resolve()`, allowing attackers to write files outside the intended directory.
**Learning:** `path.resolve()` does not sanitize paths; it resolves relative paths. Trusting external filenames (even from headers) is dangerous without sanitization.
**Prevention:** Always use `path.basename()` on filenames derived from external sources before joining them to a directory path.
