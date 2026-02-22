## 2025-05-28 - Path Traversal in File Download
**Vulnerability:** Path traversal in `downloadFile` function when processing `Content-Disposition` header.
**Learning:** `make-fetch-happen` (and `fetch`) does not automatically sanitize filenames from headers. Using `path.resolve` directly with unsanitized input is unsafe.
**Prevention:** Always use `path.basename()` on filenames from external sources before using them in file system operations.
