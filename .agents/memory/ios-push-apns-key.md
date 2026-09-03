---
name: iOS push APNs key for com.rwabi.almndi
description: History of APNs Auth Key used for iOS push — what went wrong and current state
---

## Current State (Active — confirmed working 2026-09-03)

- **APNs Key ID**: `6ANLN5RM62`
- **Key file**: `certs/AuthKey_6ANLN5RM62.p8`
- **Team ID**: `27476VAG8Z`
- **Bundle ID**: `com.rwabi.almndi`
- **iosAppCredentials ID**: `f6955a2b-69d9-49e4-bed3-8eb9f91342e7`
- **Provisioning profile**: `aps-environment: production` ✅ (valid until 2027-07-23)
- **Expo remote assignment**: `6ANLN5RM62` is linked to the app's iOS credentials and successfully delivered a TestFlight push.

## History

### Key L3432Q48N5 — REVOKED (dead)
The original key was revoked on Apple Developer Portal. Even though the p8 file still existed locally and the Expo credential was re-uploaded, APNs returned `InvalidProviderToken` (HTTP 403) on every attempt. Verified via diagnostics: EC P-256 ✅, team ID match ✅, bundle ID ✅ — the only explanation was revocation.

### Key 6ANLN5RM62 — current, created 2026-08-15
New key created on Apple Developer Portal with Environment=Production, Team Scoped. p8 uploaded to Expo and linked to iosAppCredentials. credentials.json updated.

### Key Y8RL65ZYX6 — wrong environment
This key was linked in Expo on 2026-09-02, but TestFlight delivery returned `BadEnvironmentKeyInToken` (HTTP 403). Replacing the Expo assignment with the production-capable `6ANLN5RM62` fixed delivery without requiring a new app build.

## Root Cause Pattern

`BadEnvironmentKeyInToken` from APNs means the remote Expo Push Key is not valid for the environment of the destination token (commonly a sandbox-only key being used for TestFlight production). `InvalidProviderToken`, when all of these are confirmed correct (key format, team ID, bundle ID, Expo linking), means the key was **revoked on Apple Developer Portal**. Re-uploading the same p8 file will NOT fix it — a new production key must be created on Apple's portal.

**Why:** APNs validates the `kid` claim in the JWT against its own registry of active keys. A revoked key ID is permanently invalid regardless of the key material.

**How to apply:** For `BadEnvironmentKeyInToken`, assign a Push Key explicitly created for Environment=Production to the Expo iOS credentials; no client rebuild is needed. For `InvalidProviderToken` after verified-correct credentials, go straight to Apple Developer Portal → Keys and check the key's status. If Revoked, create a new key (Environment: Production), download p8, upload to Expo via GraphQL API, update credentials.json.

## Diagnostic Checklist for `InvalidProviderToken`
1. Key format: EC P-256? ← check with `cryptography` lib
2. Team ID: matches provisioning profile? ← parse mobileprovision
3. `aps-environment: production` in provisioning profile? ← parse mobileprovision
4. Expo credentials linked correctly? ← query by project ID `75492716-d1d5-4871-bfd9-18c7ef3982c7`
5. Key status on Apple Developer Portal? ← only human can verify
If 1-4 pass and error persists → key is revoked (step 5).
