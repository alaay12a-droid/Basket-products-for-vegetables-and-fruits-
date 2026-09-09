---
name: Delivery eligibility locking
description: Concurrency rule for mutations that can change which branch may accept a delivery.
---

Any mutation that changes delivery eligibility must participate in the same namespaced PostgreSQL advisory-lock protocol as delivery order admission. Acquire affected ownership keys in sorted order; use key `0` for an unassigned delivery zone.

**Why:** Capacity admission is only safe if branch settings, product overrides, zone ownership, and destructive branch/zone operations cannot change behind the final resolver. Nullable zone ownership otherwise creates a lock-free race.

**How to apply:** When adding a route that changes branch eligibility or zone ownership, lock all old/new branch keys transactionally, re-read ownership and authorization after locking, and retry from a fresh transaction if ownership changed.