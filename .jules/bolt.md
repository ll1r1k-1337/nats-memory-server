## 2026-02-22 - [Optimizing Stream Processing]
**Learning:** Checking binary buffers directly with `Buffer.includes()` is much faster than `toString().includes()` for finding sentinel values in high-throughput streams.
**Action:** When monitoring `stderr` or `stdout` for a specific message, pre-allocate the message as a Buffer and use `includes()` on the raw chunks.
