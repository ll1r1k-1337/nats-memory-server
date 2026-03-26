## 2024-03-26 - High-Volume Stream Processing in NatsServer
**Learning:** For high-volume log streams (e.g., stderr in NatsServer), allocating strings for every chunk (data?.toString()) causes high CPU overhead, especially when processing continues long after it's strictly needed.
**Action:** Use state flags (like isReady) and early returns to completely bypass log chunk processing when the verbose flag is off. Additionally, check Buffer.isBuffer(data) and use data.includes() directly on the binary stream instead of unconditionally allocating strings for text checks.
