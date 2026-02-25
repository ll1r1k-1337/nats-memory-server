## 2026-02-25 - Buffer vs String for Stream Monitoring
**Learning:** For high-volume log streams (like `stderr` in `NatsServer`), using `Buffer.includes()` on binary chunks to detect state changes (e.g., "Server is ready") is significantly more efficient than calling `.toString()` on every chunk.
**Action:** When monitoring data streams, use state flags (e.g., `isReady`) to bypass expensive operations once the desired state is reached, while ensuring the stream continues to be consumed to prevent process blocking.
