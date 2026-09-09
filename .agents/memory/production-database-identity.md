---
name: Production database identity
description: Identifies the authoritative restaurant dataset when validating production database connections.
---

The production service must use the database containing سلة الخضار data. A dataset branded “Al Bait Al Shami” is not the intended production database.

**Why:** The user explicitly confirmed that سلة الخضار is the correct production dataset after the Render service was found serving Al Bait Al Shami data.

**How to apply:** Before changing or approving a production `DATABASE_URL`, verify it points to a database whose app identity and restaurant data belong to سلة الخضار. Do not migrate, overwrite, or delete either dataset merely to make them match.