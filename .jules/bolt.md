## 2026-02-23 - Buffer.includes vs toString().includes
**Learning:** `Buffer.includes` is significantly faster (150x in micro-benchmarks) than converting a buffer to a string with `toString()` and checking for inclusion, especially for large buffers or high-frequency checks.
**Action:** When scanning binary streams (like `stderr` from a child process) for a known string pattern, prefer `Buffer.includes` to avoid string allocation overhead, especially if the stream is verbose.
