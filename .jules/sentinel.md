## 2026-03-06 - Path Traversal Vulnerability in Filename Extraction
**Vulnerability:** The extracted filename from `Content-Disposition` headers in `src/utils/download-file.ts` lacked sanitization, allowing potential path traversal attacks (e.g., `filename="../../../etc/passwd"`).
**Learning:** `make-fetch-happen` (or node-fetch) headers parse Content-Disposition as raw strings. The previous extraction using `.split('filename=')[1]` also failed to handle quoted filenames correctly, compounding extraction errors and exposing directory traversal paths.
**Prevention:** Apply strict regex to match quoted and unquoted filenames accurately. Strip any leading/trailing quotes, and use `path.basename()` consistently to strip any relative directory traversal path components.
