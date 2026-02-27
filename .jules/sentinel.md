## 2024-05-24 - [Path Traversal in File Download]
**Vulnerability:** The `downloadFile` function blindly trusted the filename provided in the `Content-Disposition` header, allowing a malicious server to overwrite files outside the intended directory via path traversal (e.g., `../../evil.zip`).
**Learning:** Never trust input from external sources, even headers from what is presumed to be a trusted server. Standard library functions like `path.join` or `path.resolve` do not prevent traversal; explicit sanitization is required.
**Prevention:** Use `path.basename()` to strip directory components from filenames derived from external input before using them in file system operations. Additionally, use robust regex to parse headers to handle edge cases like quoted filenames.
