# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

---

## سلة الخضار (`artifacts/rawabi-menu`)

Premium Arabic mobile restaurant ordering app built with Expo React Native.

### App Info
- **Name**: سلة الخضار
- **WhatsApp**: 966530707042
- **Phone**: 0530707042
- **Location**: تبوك - حي الروضة
- **Expo Slug**: rawabi-menu
- **Android Package**: com.rwabi.almndi
- **iOS Bundle ID**: com.rwabi.almndi

### Design System
- **Colors**: dark red `#C8171A`, gold `#E8920C`, dark background `#0F0A05`
- **Font**: Cairo (Regular 400, SemiBold 600, Bold 700, ExtraBold 800)
- **Layout**: RTL Arabic throughout

### Key Files
- `constants/menu.ts` — full menu data (food items, drinks, prices, images)
- `app/_layout.tsx` — root layout with AuthGate (redirects to onboarding if new user)
- `app/onboarding.tsx` — 3-step onboarding (name → phone → location with GPS)
- `context/UserContext.tsx` — AsyncStorage-based user persistence
- `app/(tabs)/index.tsx` — main menu screen
- `app/cart.tsx` — cart with WhatsApp order sending (includes user info)
- `assets/images/` — all food/drink images

### Metro / Workflow Notes
- **Metro file map cache** can corrupt if the workflow is killed mid-write. Fix: delete `/tmp/metro-file-map-*` files and restart.
- **Memory**: Metro requires ~1GB+ free RAM. If the system runs low on memory (due to leaked TypeScript server processes), the workflow will crash silently. The processes clean up automatically over time.
- **dev script**: `pnpm exec expo start --localhost --port $PORT` (no `--clear` flag; Metro reuses the file map cache for fast restarts)
- **watchFolders**: kept at Expo default (includes workspace node_modules for pnpm symlink resolution)

### Features Implemented
1. Full menu with categories (مناسبات، مندي، مشويات، مقبلات، سلطات، مشروبات، عصائر)
2. Add to cart, quantity controls, total price
3. WhatsApp ordering (secondary option, sends formatted Arabic message)
4. 3-step Arabic onboarding (name, phone, GPS location)
5. User data persisted via AsyncStorage
6. **In-app ordering system** — checkout screen → API order creation → order confirmed screen
7. **Cashier dashboard** — PIN-protected (PIN: 1234), real-time polling every 10s, status management (pending → preparing → ready → done)
8. Electronic payment (Moyasar) placeholder — shown as "coming soon"
9. **Menu management admin panel** — add, edit, delete items, toggle availability (نافد/متاح)

### Ordering Flow
- Customer: Cart → Checkout (`/checkout`) → POST `/api/orders` → Order Confirmed (`/order-confirmed`)
- Cashier: Main menu header icon → PIN screen → Cashier dashboard (`/cashier`) → [list icon] → Admin menu (`/admin-menu`)

### Menu Management
- API: `GET/POST /api/menu`, `PUT/DELETE /api/menu/:itemId`
- 52 items seeded automatically from static data on first server start (idempotent via ON CONFLICT DO NOTHING)
- Prices stored as halalas in DB; divided by 100 for display / multiplied by 100 on save
- Main menu fetches from API with fallback to static data
- Unavailable items show "نافد" badge and cannot be added to cart

### API Server Notes
- **Artifact workflow fails** due to a Replit platform port-detection limitation
- **Solution**: "Start Backend" workflow runs the server directly (`cd artifacts/api-server && PORT=8080 node ./dist/index.mjs`)
- The artifact.toml still defines `/api` → port 8080 routing correctly
- Prices stored as halalas (×100) in DB; divided by 100 when displayed in cashier
- `notes` and `customerAddress` fields accept null (use `.nullable().optional()` in Zod schema)
