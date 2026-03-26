## 2026-03-26 - Path Traversal Vulnerability in File Download
**Vulnerability:** The application extracts filenames from `Content-Disposition` headers and uses them directly in `path.resolve` without sanitization, allowing malicious servers to overwrite arbitrary files using path traversal sequences (e.g., `../../`).
**Learning:** Unsanitized filenames from external HTTP headers bypass directory boundaries, leading to arbitrary file writes. `path.basename()` alone is insufficient on POSIX systems when handling Windows-style backslash traversals.
**Prevention:** Always sanitize externally provided filenames by normalizing slashes and using `path.basename()` before resolving them against a trusted base directory.
