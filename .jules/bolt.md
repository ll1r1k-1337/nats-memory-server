## 2026-03-12 - Optimize high-volume stderr stream processing in NatsServer
**Learning:** Parsing and allocating strings for every buffer chunk in a high-volume process log stream (like the NATS server's stderr) can introduce noticeable overhead.
**Action:** Use a state flag (like `isReady`) and check `Buffer.isBuffer(data)` directly to use `.includes()` on binary chunks without converting to strings when monitoring process logs for specific substrings, bypassing early and skipping expensive operations.
