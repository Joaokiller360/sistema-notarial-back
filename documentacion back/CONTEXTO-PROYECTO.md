# CONTEXTO DEL PROYECTO — Sistema de Gestión Notarial (Frontend)

> Documento de referencia para retomar contexto rápido. Última revisión: 2026-09-03.
> Si algo aquí no coincide con el código, gana el código (verificar antes de asumir).

---

## 1. Qué es

Plataforma web para gestión de una notaría: archivos notariales (con PDF), clientes,
usuarios con RBAC, noticias internas, notificaciones y tareas entre usuarios, logs de
auditoría y configuración de sistema. Solo frontend; consume un backend NestJS + Prisma
por REST.

- Repo: `sistema-notarial-front` (GitHub: Joaokiller360)
- Ramas: `development` (activa), `main`, `production`. Remote se llama `original`.
- Idioma UI: español. Locale fechas: `es-EC`.

---

## 2. Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 16.2.6 | App Router, RSC |
| React | 19.2.4 | UI |
| TypeScript | ^5 | strict |
| TailwindCSS | v4 | estilos (config en `globals.css`, no `tailwind.config`) |
| shadcn/ui | v4, style `base-nova`, Base UI (`@base-ui/react`) | componentes en `src/components/ui` |
| Zustand | ^5 | estado global (con `persist`) |
| React Hook Form | ^7 + `@hookform/resolvers` | formularios |
| Zod | ^4 | validación (locale español via `src/lib/zod-locale.ts`) |
| Axios | ^1 | cliente HTTP con interceptores refresh-token |
| Sonner | ^2 | toasts |
| jsPDF | ^4 | generar PDF desde imágenes |
| TipTap | ^3 | editor rich text (`src/components/ui/rich-text-editor.tsx`) |
| DOMPurify | ^3 | sanitizar HTML |
| Resend | ^6 | envío de emails (API routes server-side) |
| jwt-decode | ^4 | decodificar JWT en cliente y middleware |
| lucide-react | iconos |

Node `>=20.9.0`. Scripts: `npm run dev | build | start | lint`.

---

## 3. Variables de entorno

`.env.local` (ejemplo en `.env.local.example`):

```
NEXT_PUBLIC_API_URL=http://localhost:8001/api/v1     # base del backend
RESEND_API_KEY=...                                    # server-only, emails
RESEND_FROM_EMAIL=onboarding@resend.dev               # server-only, remitente
```

- `next.config.ts` deriva `API_BASE` quitando `/api/v1` a `NEXT_PUBLIC_API_URL`.
  Fallback: `https://developer.joaobarres.dev`.
- `rewrites`: `/uploads/:path*` → `${API_BASE}/uploads/:path*` (proxy de archivos subidos).
- `images.remotePatterns`: permite `https://developer.joaobarres.dev/uploads/**`.

---

## 4. Estructura de carpetas (`src/`)

```
app/
  (auth)/            layout con branding; login, forgot-password, reset-password
  (dashboard)/       layout protegido (AuthGuard); todas las páginas internas
    dashboard/       panel con métricas
    archives/        listado, new, [id], [id]/edit  (páginas grandes: new 871, edit 820 líneas)
    clients/         listado (939 líneas — incluye alta/bulk), [id]
    users/           listado, new, [id]/edit
    news/            listado, new, [id]
    notifications/   bandeja + tareas
    logs/            auditoría (solo SUPER_ADMIN)
    settings/        profile, security, system
  api/
    download-pdf/    GET proxy: pide view-url al backend y devuelve el PDF como attachment
    emails/          news | notification | task | test  (POST, runtime nodejs, requireAuth)
  layout.tsx         RootLayout: fuente Roboto, <html class="dark">, Providers
  globals.css        Tailwind v4 + tokens de tema (dark por defecto)
  not-found.tsx, page.tsx
api/
  axios.client.ts    apiClient + apiFormClient (multipart) con interceptores
components/
  common/            PageHeader, DataTable, Pagination, FileUpload, StatCard, EmptyState,
                     StatusBadge, LoadingSpinner/PageLoader, GrantorForm, CharCounter,
                     NacionalidadSelect, NotaryForm, NotaryInfoBadge, ClientSearchInput
  layout/            Sidebar, Navbar, Breadcrumbs, MobileSidebar, Footer
  notifications/     NotificationBell, NotificationInbox, NotificationHistory,
                     SendNotificationForm, TaskAssignForm, MyTasksList
  archives/          PhotoToPdfUploader
  ui/                shadcn (button, dialog, table, select, tabs, popover, command,
                     rich-text-editor, alert-dialog, PdfGeneratingOverlay, ...)
guards/              AuthGuard (client, espera hidratación de store), RoleGuard
hooks/               useAuth, useArchives, useUsers, useNews, useNotifications(+Bootstrap),
                     usePermissions, useSystemSettings, useTokenRefresh
lib/                 utils(cn), resend, email-templates, zod-locale, route-auth
providers/           Providers (TooltipProvider + Toaster de sonner)
schemas/             notary.schema.ts (Zod + sanitizeText anti-inyección)
services/            1 archivo por dominio (ver §7). Barrel en index.ts
store/               auth, ui, notification, archiveFormStore, notary  (barrel en index.ts)
types/               1 archivo por dominio + ApiError/SelectOption en index.ts
utils/               token (localStorage JWT), formatters, formatDate/DateTime, getInitials
constants/           paises.const.ts (nacionalidades)
middleware.ts        protección de rutas por cookie JWT
```

---

## 5. Autenticación y sesión (IMPORTANTE — hay doble almacén)

Los tokens viven en **dos lugares** y hay que mantenerlos sincronizados:

1. **localStorage** (`src/utils/token.ts`, claves `notaria_access_token` /
   `notaria_refresh_token`) — lo usa Axios para el header `Authorization`.
2. **Cookie** `notaria_access_token` — la escribe/borra `useAuth` manualmente con
   `document.cookie`; la lee `middleware.ts` (SSR) y `src/lib/route-auth.ts` (API routes).

`useAuthStore` (Zustand + persist en localStorage, clave `notaria-auth`) persiste solo
`user` + `isAuthenticated`. Flag `_hasHydrated` para no decidir antes de hidratar.
Helpers en el store: `hasPermission(name)` (SUPER_ADMIN pasa todo), `hasRole(roles)`.

### Flujo
- **Login** (`useAuth.login`): `authService.login` → `setAuth(user, tokens)` guarda tokens
  en localStorage + set store; luego escribe la cookie con `max-age=tokens.expiresIn`.
- **Middleware** (`src/middleware.ts`): decodifica la cookie, valida `exp`.
  - `/` → redirige a `/dashboard` o `/login` según sesión.
  - Ruta no pública sin token → `/login?callbackUrl=...`.
  - Ruta de auth con token → `/dashboard`.
  - Rutas públicas: `/login`, `/forgot-password`, `/reset-password`.
  - `matcher` excluye `api`, `_next/*`, estáticos.
- **AuthGuard** (client, en `(dashboard)/layout.tsx`): si ya hidrató y no autenticado →
  `router.replace("/login")`. Renderiza `null` hasta hidratar.
- **Refresh automático** — DOS mecanismos:
  1. `useTokenRefresh` (hook en dashboard layout): timer que refresca 5 min antes de
     `exp` llamando `POST /auth/refresh` con `{ userId: sub, refreshToken }`.
  2. Interceptor de respuesta en `axios.client.ts`: ante 401 (una vez, `_retry`),
     refresca y reintenta; encola requests concurrentes en `failedQueue`.
     Ante 429 reintenta hasta 2 veces respetando `Retry-After`.
     Si falla el refresh → `clearTokens()` + `window.location.href = "/login"`.
- **Logout**: `authService.logout(refreshToken)` + `clearAuth()` + borra cookie + push `/login`.
- **changePassword**: tras éxito fuerza logout (limpia sesión y redirige a login).

⚠️ La cookie **no** se actualiza en los refresh (solo localStorage). Tras un refresh la
cookie puede quedar con el token viejo hasta el próximo login; el middleware valida `exp`
de esa cookie. Tenerlo presente al depurar redirecciones a `/login`.

---

## 6. RBAC

Roles (`type Role`): `SUPER_ADMIN`, `NOTARIO`, `ARCHIVADOR`, `MATRIZADOR`.

| Rol | Permisos de negocio |
|---|---|
| SUPER_ADMIN | todo + `/settings/system` + logs + crear/borrar noticias |
| NOTARIO | archivos + gestión de usuarios |
| ARCHIVADOR | crear y editar archivos |
| MATRIZADOR | solo lectura de archivos |

- `usePermissions()` expone helpers semánticos: `canManageUsers`, `canCreateArchive`,
  `canEditArchive`, `canDeleteArchive`, `canViewSystemSettings`, `canCreateNews`,
  `canDeleteNews`, `isSuperAdmin/isNotario/isArchivador/isMatrizador`, `primaryRole`.
- `<RoleGuard roles={[...]}>` o `<RoleGuard action="create" resource="archives">` para
  ocultar UI. `fallback` opcional.
- Sidebar filtra items por `roles` (`filterByRole`). Users y Logs restringidos.
- El backend normaliza roles de varias formas; `usersService` los aplana con
  `normalizeRoles` (lee `userRoles[].role.type|name`, o `roles` string/objeto).
  `extractRoleKey` en `utils/formatters.ts` hace lo mismo puntualmente.

---

## 7. Capa de servicios (`src/services/`)

Todos usan `apiClient` (JSON) salvo subidas que usan `apiFormClient` (multipart).
El backend responde envuelto: `{ success, data, message, timestamp }` (`BackendApiResponse<T>`).
Muchos servicios tienen lógica defensiva para **desenrollar formas de respuesta variables**
(a veces `data.data`, a veces `data` array, a veces `items`) — ver `clients.service` que
maneja 5 formas distintas. No "limpiar" eso sin verificar el backend.

| Servicio | Endpoints / notas |
|---|---|
| `authService` | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/me` (GET/PATCH), `/auth/change-password` |
| `archivesService` | `/archives` CRUD; `/archives/:id/upload-pdf` (multipart, `onUploadProgress`); `/archives/check-code`; `/files/view-url?key=`; `downloadPdf` va por `/api/download-pdf` (Next route); `generatePdf` = imágenes→jsPDF→upload; `delete` manda `{ confirmar_eliminacion: true }` |
| `usersService` | `/users` CRUD; `getAll` **enriquece** cada usuario con un GET `/users/:id` en paralelo (para roles). `toggle-active`, `:id/password`. Normaliza roles |
| `clientsService` | `/clients` (paginado multiforma), `/clients/:id`, `/clients/:id/archives`, `/clients` POST, `/clients/bulk` |
| `newsService` | `/news` CRUD; `create` usa multipart si hay `image`; `fixImageUrl` reescribe `localhost` → origin del API |
| `notificationsService` | `/notifications` POST, `/notifications/inbox`, `/notifications/sent`, `:id/read`, `read-all`, DELETE. Paginado con clave `pages` (no `totalPages`) |
| `tasksService` | `/tasks` POST, `/tasks/received`, `/tasks/assigned`, `:id/status`, `:id/read`, DELETE |
| `systemService` | `/system/config` GET/PATCH → `{ maxPdfSizeMb, maxPdfImages, systemVersion }` |
| `logsService` | `/logs` GET (paginado), `/logs/:id` |
| `rolesService` | `/roles?limit=100` → devuelve `data.data` (lista de `RoleItem`) |
| `notaryService` | `/notaries` GET (toma `[0]`), POST, PATCH `:id`. Payload sanitizado con `sanitizeText`. Backend: módulo Notaries en NestJS ya existe (ver `memory/project_backend_notary.md`) |

---

## 8. Hooks de dominio (patrón)

Cada hook (`useArchives`, `useUsers`, `useNews`, `useSystemSettings`) sigue el mismo patrón:
estado local (`isLoading`, `isSubmitting`, `isError`), funciones `fetchX`/`fetchXById`
memoizadas con `useCallback`, `createX`/`updateX`/`deleteX` con `toast` de éxito/error,
extracción de mensaje de error del backend (`message` string o array unida con `" · "`).
No usan react-query; el estado de servidor vive en el estado local del hook o en Zustand.

- `useArchives`: además `generateCode(type)` (prefijos ARQ/CERT/DIL/PROT/OTR + año + random),
  `fetchAllArchives` (pagina secuencialmente 100/pág, máx 10 págs, para evitar 429;
  el DTO backend prohíbe `type` como query param).
- `useNotifications`: split en dos:
  - `useNotificationsBootstrap()` — se llama **una sola vez** en `DashboardContent`.
    Hace los fetch (users, inbox+sent, received+assigned) hacia el `notificationStore`.
    Se separó así porque llamarlo desde varios componentes causaba ráfagas de 429.
  - `useNotifications()` — solo lee del store + acciones (send, createTask, readOne/All,
    changeTaskStatus, removeX). Derriva `inbox/sent/myTasks/assignedTasks/unreadCount/
    pendingTaskCount` con `useMemo`. `canSend` = SUPER_ADMIN o NOTARIO.
    Los envíos disparan además `fetch("/api/emails/...")` en background (best-effort).
- `useTokenRefresh`: ver §5.

---

## 9. Stores Zustand (`src/store/`)

| Store | Persist | Contenido |
|---|---|---|
| `auth.store` | localStorage `notaria-auth` (solo user + isAuthenticated) | sesión + `hasPermission`/`hasRole` + `_hasHydrated` |
| `ui.store` | localStorage `notaria-ui` (solo `sidebarCollapsed`) | sidebar colapsado/móvil, `isGeneratingPdf` (bloquea navegación mientras genera PDF) |
| `notification.store` | no persiste | `notifications[]`, `tasks[]`, `users[]`, `usersLoading` + mutadores (set/prepend/patch/remove) |
| `archiveFormStore` | no persiste | `uploadedPdfFile`, `photoFiles[]` + reorder/remove/reset (wizard de creación de archivo) |
| `notary.store` | **sessionStorage** `notaria-notary` | `notaryData`, `notaryId` |

---

## 10. Archivos notariales (dominio central)

- `type ArchiveType = "A" | "C" | "D" | "O" | "P"` (Arrendamiento, Certificación,
  Diligencia, Otro, Protocolo). `ArchiveStatus`: ACTIVO/INACTIVO/PENDIENTE/ARCHIVADO.
- `Archive` tiene `grantors[]` (otorgantes) y `beneficiaries[]` (beneficiarios), cada uno
  `{ nombresCompletos, cedulaORuc?, nacionalidad }`. Autocompletado desde clientes con
  `ClientSearchInput` / `GrantorForm`.
- `code` se autogenera (`generateCode`) y se valida contra `/archives/check-code`
  (`available | deleted | active`).
- **PDF**: subida por multipart con barra de progreso. Alternativa: subir fotos →
  `PhotoToPdfUploader` → `generatePdfFromImages` (jsPDF, con
  `normalizeImageOrientation` para EXIF) → upload. Límite de tamaño e imágenes desde
  `/system/config` (`maxPdfSizeMb`, `maxPdfImages`).
- Descarga: `GET /api/download-pdf?key=` (route de Next) que pide `view-url` firmada al
  backend y hace stream del PDF como `attachment` (sanitiza el filename).
- Validación de PDF en cliente (según README): extensión, MIME, firma `%PDF-`, `%%EOF`,
  y escaneo de construcciones peligrosas (JavaScript, OpenAction, Launch, XFA...).
- Páginas `archives/new` (871 líneas) y `archives/[id]/edit` (820) son las más pesadas;
  son wizards con RHF + Zod + `archiveFormStore`.

---

## 11. Emails (Resend, server-side)

Rutas `POST /api/emails/{news|notification|task|test}`, `runtime = "nodejs"`.
Todas exigen `requireAuth(req)` (`src/lib/route-auth.ts`: valida cookie JWT `sub` + `exp`).
- `lib/resend.ts`: `sendEmail` (uno) y `sendBatch` (hasta 100/lote vía `/emails/batch`).
- `lib/email-templates.ts`: `newsEmail`, `notificationEmail`, `taskEmail` (HTML).
- Se llaman en background desde `useNews.createNews` (a todos los usuarios, paginando)
  y `useNotifications.send`/`createTask`. Errores no son fatales.
- `FROM_EMAIL` = `RESEND_FROM_EMAIL` o `onboarding@resend.dev`.

---

## 12. UI / estilo

- Tema **dark fijo**: `<html class="dark">` en `RootLayout`, sin toggle.
- Fuente: Roboto (`next/font`), var `--font-roboto` = `--font-sans`.
- Tailwind v4: toda la config y tokens (`--primary`, `--sidebar`, `--card`, `--radius`...)
  en `src/app/globals.css` con `@theme inline`. No existe `tailwind.config.js`.
- Color de marca: azul `#1D2C49` (paneles auth, toasts).
- shadcn style `base-nova`, iconos lucide. Componentes en `src/components/ui`.
- `cn()` en `src/lib/utils.ts` (clsx + tailwind-merge).
- Toasts: sonner, `position="top-right"`, `richColors`, estilo custom oscuro.
- Layout dashboard: Sidebar (colapsable, `w-64`/`w-16`) + Navbar + Breadcrumbs + main
  scrollable + Footer. `MobileSidebar` para < md. Badge de no leídas en item Notificaciones.

---

## 13. Rutas

**Públicas:** `/login`, `/forgot-password`, `/reset-password?token=xxx`.

**Protegidas (JWT):**
`/dashboard`, `/archives`, `/archives/new` (SA·NOT·ARCH), `/archives/:id`,
`/archives/:id/edit` (SA·NOT·ARCH), `/clients`, `/clients/:id`,
`/news`, `/news/new` (SA), `/news/:id`, `/notifications`,
`/users`, `/users/new`, `/users/:id/edit` (SA·NOT),
`/logs` (SA), `/settings/profile`, `/settings/security`, `/settings/system` (SA).

---

## 14. Convenciones observadas

- Manejo de error: leer `error.response.data.message`; si es array unir con `" · "`;
  fallback en español; mostrar con `toast.error`.
- Servicios devuelven `data.data` desenvuelto; el componente/hook nunca ve el wrapper.
- Nada de react-query: fetch en hooks con `useCallback` + estado local.
- Zod con locale español global (`import "@/lib/zod-locale"` en `Providers`).
- Sanitización de texto notarial: `sanitizeText` (quita `<>"\&;(){}[]/=%+#$@!*^|\`` ,
  colapsa espacios, lanza si detecta `<script`, `javascript:`, `onerror=`, etc.).
- Comentarios de negocio en español; algunos en inglés en utilidades.
- Barrels `index.ts` en services, hooks, store, types, components/*.
- Guardas de seguridad duplicadas cliente+servicio (p.ej. no borrar SUPER_ADMIN).

---

## 15. Cosas frágiles / gotchas

1. Tokens en localStorage **y** cookie; la cookie no se refresca en los refresh silenciosos.
2. `usersService.getAll` hace N+1 requests (un GET por usuario) — cuidado con listas grandes / 429.
3. Respuestas del backend con forma inconsistente; los servicios tienen ramas defensivas — no borrarlas a ciegas.
4. `useNotificationsBootstrap` debe llamarse **solo una vez** (en el layout). Llamarlo en más sitios = ráfagas 429.
5. `fetchAllArchives` limita a 10 páginas × 100 = 1000 registros máx.
6. Interceptor 401: `failedQueue` es module-scope y compartido entre `apiClient` y `apiFormClient`; `isRefreshing` también.
7. Middleware `matcher` excluye rutas con `.` — cuidado con rutas que lleven punto.
8. `.env*` está en `.gitignore`; no commitear claves de Resend.
9. Remote git se llama `original`, no `origin`.

---

## 16. Backend (contexto externo)

NestJS + Prisma, REST bajo `NEXT_PUBLIC_API_URL`. Módulo `Notaries` ya implementado
(`POST/PATCH /notaries`, campos `notaryName`, `notaryNumber`, `notaryOfficerName`).
Si aparece error "Prisma Client no tiene modelo Notary" → correr `prisma generate` local
(en contenedor se regenera en build). Detalle en `memory/project_backend_notary.md`.
