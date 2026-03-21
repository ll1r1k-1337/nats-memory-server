## 2024-03-21 - High-Volume Log Processing Bottleneck
**Learning:** In high-volume log streams like `stderr` from NATS, indiscriminately casting every chunk to a string and searching it via `.includes()` causes massive CPU overhead after the server is already ready.
**Action:** Use a state flag (`isReady`) to early-return for irrelevant processing, and use `Buffer.isBuffer(data) && data.includes('Server is ready')` to avoid expensive `.toString()` allocations entirely when dealing with binary chunks.
