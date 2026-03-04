## 2024-03-04 - Optimize stream parsing
**Learning:** Calling `.toString()` on every stream chunk for high-volume logs (like `stderr` in `NatsServer`) introduces significant overhead.
**Action:** Use `Buffer.includes()` on binary chunks directly to detect state changes (e.g., "Server is ready"), and use state flags (`isReady`) to bypass expensive operations once the desired state is reached, while ensuring the stream continues to be consumed to prevent process blocking.
