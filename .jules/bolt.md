## 2026-02-19 - Buffer vs String processing
**Learning:** `Buffer.includes` is significantly faster and allocates less memory than `Buffer.toString().includes`.
**Action:** When searching for substrings in streams (like logs), use `Buffer.includes` on raw chunks instead of converting to string, especially if the string isn't otherwise needed.
