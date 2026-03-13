## 2025-03-13 - Optimize High-Volume stderr Stream Processing
**Learning:** Calling `.toString()` on every `stderr` chunk for a long-running child process creates significant memory allocation overhead. High-volume streams shouldn't perform string conversion unless strictly necessary (e.g. for verbose logging).
**Action:** Introduce an `isReady` state flag to early-return from the data handler when processing is no longer needed. Check `Buffer.isBuffer(data)` and use `data.includes()` on binary chunks to check for ready messages without expensive string allocations.
