
## 2024-05-20 - High-volume Log Stream Processing Overhead
**Learning:** Calling `data.toString()` on every chunk emitted by a high-volume `stderr` stream inside a Node.js child process listener creates significant CPU and memory overhead due to continuous string allocations.
**Action:** Use a state flag (e.g., `isReady`) to enable a fast-path early return from the data listener once the required target state is achieved, avoiding any further string conversion or processing on subsequent chunks if logging is disabled.
