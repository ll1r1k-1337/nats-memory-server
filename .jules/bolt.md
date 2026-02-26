## 2026-02-26 - Optimize Stream Monitoring
**Learning:** Monitoring child process `stderr` for a ready signal can be expensive if `data.toString()` is called on every chunk throughout the process lifetime.
**Action:** Use a state flag (e.g., `isReady`) to stop checking once the signal is found. Also, use `Buffer.includes()` to search raw buffers instead of allocating strings when logging is disabled.
