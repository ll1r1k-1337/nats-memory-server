## 2024-03-24 - NatsServer stderr string conversion bottleneck
**Learning:** For high-volume log streams like `stderr` in `NatsServer`, calling `toString()` on every binary chunk causes expensive runtime allocations.
**Action:** Use state flags (like `isReady`) and check `Buffer.isBuffer(data)` to use `data.includes('Server is ready')` on binary chunks instead of calling `.toString()` on every chunk, and use early returns to bypass expensive operations entirely once the desired state is reached.
