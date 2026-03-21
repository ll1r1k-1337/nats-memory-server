## 2026-03-21 - Path Traversal in File Download
**Vulnerability:** Extracted filename from `Content-Disposition` header was directly passed to `path.resolve` without sanitization, allowing path traversal (e.g. `../../../etc/passwd`).
**Learning:** Never trust filenames from remote servers. Simple string splitting is insufficient to extract filenames securely, and `path.resolve` will evaluate relative path components from user input.
**Prevention:** Use robust regex to extract filenames handling quotes, and explicitly sanitize against path traversal using `path.basename()` combined with cross-platform slash normalization (`.replace(/\\/g, '/')`).
