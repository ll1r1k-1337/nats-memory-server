## 2026-02-25 - Path Traversal in File Downloads
**Vulnerability:** Unsanitized `Content-Disposition` filenames allowed writing files outside the target directory (Path Traversal/Zip Slip).
**Learning:** File downloads relying on external headers (`Content-Disposition`) must treat filenames as untrusted input.
**Prevention:** Use `path.basename()` to strip directory components from filenames derived from external sources before using them in file system operations.
