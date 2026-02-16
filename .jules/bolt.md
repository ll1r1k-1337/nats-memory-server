## 2026-02-16 - Node.js Stream Event Overhead
**Learning:** Attaching a 'data' listener to a high-volume stream (like stderr of a chatty process) has significant overhead if the listener performs synchronous operations (like toString() and string matching) on every chunk, even when the data is no longer needed.
**Action:** Always unsubscribe or use a state flag to early-return from stream listeners once the relevant data has been extracted, especially for long-running processes.
