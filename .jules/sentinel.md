## 2026-03-23 - Arbitrary File Write via Path Traversal in File Download
**Vulnerability:** Directly using the `filename` from a `Content-Disposition` HTTP header in file download scripts allows a malicious server to specify directory traversal paths like `../../foo.txt` and drop arbitrary files anywhere on the system.
**Learning:** External or untrusted servers can send malicious metadata in headers (like `Content-Disposition`) to overwrite sensitive files.
**Prevention:** Always sanitize filenames from untrusted sources by extracting only the base name (e.g., using `path.basename()` after replacing backslashes) before resolving the download destination path.
