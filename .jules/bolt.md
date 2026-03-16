## 2024-03-16 - Builder Pattern Performance Optimization
**Learning:** In performance-sensitive Builder patterns, using object spreading (`this.options = { ...this.options, key: value }`) for state updates causes unnecessary allocations and is significantly slower than direct assignment, especially when called repeatedly in loops.
**Action:** Use direct property assignment (`this.options.key = value`) in setter methods after safely cloning the initial state object to avoid mutating shared global constants.
