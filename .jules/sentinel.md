## 2024-03-15 - Path Traversal in File Download
**Vulnerability:** The downloaded file name is extracted from the `Content-Disposition` header without sanitization, allowing path traversal (e.g., `../../../etc/passwd`) which writes files outside the target directory.
**Learning:** Even internal headers from fetch requests can be unsafe if the origin is unverified or hijacked. Path validation is essential at the boundary.
**Prevention:** Always extract safely using robust regex and strictly apply `path.basename` to user or server-provided filenames before `path.resolve`.
