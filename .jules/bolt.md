## 2026-02-17 - Efficient Stream Monitoring with Buffers
**Learning:** Parsing `stderr` from spawned processes by converting every chunk to a string using `.toString()` creates significant garbage collection pressure, especially when the process is verbose or runs for a long time. This is wasteful when only scanning for a specific startup message.
**Action:** Use `Buffer.prototype.includes()` with a pre-allocated Buffer to scan for byte sequences directly. Use a state flag (e.g., `isReady`) to stop scanning once the target message is found, preventing further overhead.
