## 2026-03-23 - Bypass Log Conversion and Streamline Object Allocation
**Learning:** High-frequency event streams (like stderr) can accrue significant overhead with repetitive allocations (e.g. .toString()) and Builder patterns using object spreads create substantial allocation churn in hot loops.
**Action:** Use early-returns, track states (like isReady), check chunks safely using Buffer.isBuffer(data), and use direct mutations on pre-allocated objects in builders to mitigate these bottlenecks.
