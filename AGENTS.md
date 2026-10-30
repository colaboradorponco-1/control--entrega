# SISTEMA-CONTROL-POLLO

React 19 + Vite 8 + Supabase + Tailwind v4 + PWA. Spanish-language chicken order/delivery control system. No TypeScript, no tests.

## Commands

- `npm run dev` — Vite dev server on `127.0.0.1:5173` (strictPort)
- `npm run build` — production build (PWA precache)
- `npm run lint` — oxlint (must be clean before commit)
- `npm run preview` — preview built app

No test suite exists. Verification = `npm run lint` + `npm run build`.

## Architecture

- `src/modules/` — feature pages by role: `admin/`, `sucursal/`, `planta/`, `despacho/`, `dueno/`, `panel/`, `auth/`, `superadmin/`
- `src/repositories/` — Supabase data access (one per domain: `pedidosRepository`, `AuthRepository`, `adminRepository`, etc.)
- `src/context/` — `AuthContext`, `ThemeContext`
- `src/components/` — shared UI
- `src/routes/AppRouter.jsx` — lazy-loaded routes with `ProtectedRoute` role gating
- `supabase/*.sql` — DB migrations/RPCs run manually by the user in Supabase SQL Editor (no DB access from this environment)

## Key conventions

- **Dark mode** via `.dark` class (Tailwind v4 `@custom-variant dark`). Theme toggled in `ThemeContext`. Do not use `dark:` media query.
- **Tailwind v4**: imported via `@tailwindcss/vite`; styles in `src/index.css` (`@import "tailwindcss"`). No `tailwind.config.js`. CDN must not be reintroduced.
- **Roles**: `superadmin`, `administrador`, `operador_planta`, `despachador`, `sucursal`, `dueno`. Route gating via `ProtectedRoute rolesPermitidos`.
- **Business rule**: a sucursal cannot create orders; only owner (`dueno`) / admin. Do not add order-creation UI to sucursal.
- **Order states**: `PENDIENTE → APROBADO → EN_PREPARACION → LISTO → RECOGIDO → ENTREGADO`, plus `CANCELADO`/`RECHAZADO`. Reception only allowed when state is `RECOGIDO`, requires photo + signature.
- **Bulk actions**: archive/restore/delete only; cancel/reject remain individual.
- **Audit table** `public.auditoria` columns: `id, tabla, accion, registro_id, usuario_id, usuario_nombre, datos_anteriores, datos_nuevos, creado_en`.

## Auth / navigation gotchas

- `AuthRepository.js` has a module-level `logoutSolicitado` flag + `consumirLogoutSolicitado()`/`limpiarLogoutSolicitado()`. `logout()` marks intentional sign-out. Do not remove — prevents redirect loops.
- `AuthContext` resets `sesionExpirada=false` on any session with user; sets true only on `SIGNED_OUT` when there was a user and logout was not manual.
- `ProtectedRoute` removed its own `onAuthStateChange` subscription; uses memoized `avisoState`. Do not re-add a subscription there (causes "Throttling navigation" warning).
- `Login.jsx` clears aviso via React Router `navigate({…}, { replace: true, state: null })` — never `window.history.replaceState`.

## Supabase

- No Supabase access from this environment. User runs SQL manually. Pending SQL files must be flagged to the user, not executed.
- Realtime channels use `supabase.removeChannel` cleanup in `useEffect`.

## Git

- Active branch: `feature/mejoras-avanzadas`. Do not commit unless explicitly asked.
- Remote push requires credentials for `colaboradorponco-1/control--entrega`; current user may lack permissions. Suggest fork or PAT if push fails.