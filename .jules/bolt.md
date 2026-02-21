## 2026-02-21 - Optimize stderr monitoring
**Learning:** For high-volume log streams (like `stderr` in `NatsServer`), using `Buffer.includes()` on binary chunks to detect state changes (e.g., "Server is ready") is significantly more efficient than calling `.toString()` on every chunk.
**Action:** When monitoring subprocess output for a specific string, use `Buffer.includes` on raw chunks and maintain a state flag to stop processing once the target state is reached.
