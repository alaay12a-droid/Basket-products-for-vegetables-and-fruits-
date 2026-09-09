---
name: Project independence
description: External project identities must never be copied into this project.
---

This project must use only environment-provided URLs and credentials belonging to the current project. Do not add hardcoded repository, deployment, database, Expo/EAS, Firebase, or provider project identities.

**Why:** The user explicitly required full separation from the source project while preserving the current database, schema, APIs, UI, and data.

**How to apply:** Keep web API calls relative, derive mobile API hosts from the current runtime environment, and require new project-owned credentials before enabling optional external-provider delivery.