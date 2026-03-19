## 2024-03-19 - Fix Path Traversal in downloadFile
**Vulnerability:** Extracting filenames from Content-Disposition headers using a simple string split allows malicious servers to provide filenames containing path traversal characters (e.g., `../../file.txt`), which could result in writing files outside the intended download directory.
**Learning:** Parsing HTTP headers for filenames requires robust regex to handle both quoted and unquoted values, followed by applying `path.basename()` to strip any directory components provided by the server before resolving the destination path.
**Prevention:** Always use `path.basename()` on user-provided or externally-sourced filenames before joining them with a trusted base directory to ensure cross-platform safety against path traversal attacks.
