## 2026-02-16 - [Path Traversal in File Download]
**Vulnerability:** Naive extraction of `filename` from `Content-Disposition` header allowed path traversal (e.g. `../../etc/passwd`).
**Learning:** `Content-Disposition` header values are untrusted input. The standard library `path.resolve` does not sanitize traversal characters.
**Prevention:** Always use `path.basename` on filenames from external sources before using them in file system operations. Also, verify the resolved path starts with the intended directory using `startsWith` as a defense-in-depth measure.
