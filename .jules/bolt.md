## 2023-10-25 - Early Return in NATS Log Processing
**Learning:** Parsing and converting `stderr` Buffer chunks to strings (`data.toString()`) on every log entry becomes a measurable bottleneck for long-running or high-volume test suites, especially when the logs are only needed initially to confirm `Server is ready`.
**Action:** When handling high-volume I/O streams like stdout/stderr, use early returns and `Buffer.includes` to bypass expensive `.toString()` allocations once the target condition (e.g. readiness) has been met.
