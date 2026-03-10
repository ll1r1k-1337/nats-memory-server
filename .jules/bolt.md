
## 2024-05-20 - NatsServer stderr Buffer Optimization
**Learning:** High-volume log streams (like `stderr` in `NatsServer`) are bottlenecked by continuous `.toString()` calls on every chunk, even when the desired state flag is already set.
**Action:** Introduce an `isReady` state flag for early return, and utilize `Buffer.includes()` on binary chunks instead of calling `.toString()` to bypass expensive string allocations.
