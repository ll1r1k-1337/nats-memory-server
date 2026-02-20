## 2026-02-20 - [Performance] Child Process Stderr Handling
**Learning:** When spawning child processes (like NATS server) and monitoring `stderr` for a readiness signal, the `data` event handler runs for *every* chunk of output. Converting every buffer to a string (`.toString()`) and checking `includes()` is expensive and unnecessary once the server is ready, especially if verbose logging is disabled.
**Action:** Use a state flag (e.g., `isReady`) to short-circuit the handler. If the server is ready and verbose logging is off, return immediately to avoid allocation and string searching.
