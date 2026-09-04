# Visor de PDF en /archives + Restricción de descarga/impresión por usuario

**Fecha:** 2026-09-03
**Ámbito:** Frontend (`notaria-sistema-front`) — este documento describe también lo que el **backend debe soportar** para que la restricción funcione.

---

## 1. Resumen

Se hicieron tres cosas:

1. **Visor de archivo en `/archives`** — el botón "ojo" de cada fila ahora abre un modal con toda la
   información del archivo, y se agregó un segundo botón que abre un modal con solo el PDF embebido.
2. **Restricción de descarga e impresión de PDF por usuario** — un `SUPER_ADMIN` puede marcar, desde el
   perfil de cada usuario, una casilla que le quita a ese usuario la posibilidad de descargar, imprimir o
   abrir en pestaña nueva los PDF de archivos.
3. **Creación de archivo sin espera en `/archives/new`** — al guardar, la app redirige de inmediato a
   `/archives` y la subida del PDF continúa en segundo plano; la fila del archivo nuevo aparece con el
   botón "Ver PDF" deshabilitado hasta que termina la subida.

La parte 1 es 100% frontend y no necesita backend.
La parte 2 **necesita soporte del backend** (ver sección 4).
La parte 3 es 100% frontend, pero cambia el **orden de las llamadas** al backend (ver sección 5).

---

## 2. Parte 1 — Visor de PDF en /archives

### Comportamiento

| Botón en la fila | Acción |
|---|---|
| Ojo (`Eye`) | Abre **modal "Ver todo"**: código, tipo, estado, observaciones, otorgantes, beneficiarios, metadatos (creado por / fechas) + acciones de PDF. |
| Documento (`FileText`) | Abre **modal "Solo PDF"**: `<iframe>` con el PDF a 75vh + botón "Abrir en pestaña nueva". |

### Detalles técnicos

- Archivo modificado: `src/app/(dashboard)/archives/page.tsx`.
- El modal "Ver todo" muestra primero los datos de la fila y luego hace `archivesService.getById(row.id)`
  para completar campos que el listado no trae (`createdBy`, `pdfUrl`, etc.).
- El PDF se resuelve así:
  1. `row.pdfUrl` (la "key" de S3) si viene en el listado; si no, `getById` para obtenerla.
  2. `archivesService.getPdfUrl(key)` → `GET /files/view-url?key=...` → devuelve una URL firmada temporal.
  3. Esa URL se pone como `src` del `<iframe>`.
- La descarga sigue usando el proxy ya existente `GET /api/download-pdf?key=...` (Next route handler)
  vía `archivesService.downloadPdf(key)`.

**No hay cambios de contrato con el backend en esta parte.** Se usan endpoints ya existentes:
`GET /archives/:id`, `GET /files/view-url`.

---

## 3. Parte 2 — Restricción de descarga/impresión por usuario (frontend)

### Flujo de usuario

1. `SUPER_ADMIN` entra a `/users/{id}/edit` de otro usuario (no puede aplicarse a sí mismo ni a otro
   `SUPER_ADMIN`).
2. Marca la casilla **"Restringir descarga e impresión de PDF"** y guarda.
3. La próxima vez que ese usuario carga el dashboard, la app refresca su sesión desde `/auth/me` y aplica
   la restricción sin necesidad de cerrar sesión.

### Qué se bloquea para el usuario restringido

En `/archives` (modal "Ver todo" y modal "Solo PDF") y en `/archives/{id}`:

- Se **ocultan** los botones **"Descargar"** y **"Abrir en pestaña nueva"**; se muestra un aviso
  "Descarga e impresión deshabilitadas para tu usuario".
- El `<iframe>` del PDF se carga con `#toolbar=0&navpanes=0` para ocultar los controles de
  descarga/impresión del visor de PDF de Chrome.
- Mientras un modal de PDF está abierto se bloquean `Ctrl/Cmd+P`, `Ctrl/Cmd+S` y el evento `beforeprint`,
  y se bloquea el menú contextual sobre el visor.
- Las funciones `downloadPdf()` / `handlePdf("download")` abortan con un toast si el usuario está
  restringido (defensa por si algún botón quedara accesible).

> **Nota:** es una medida **disuasoria**, no infalible. No impide capturas de pantalla ni la impresión a
> nivel de sistema operativo. Un bloqueo real requiere marca de agua / DRM en el backend, fuera de este
> alcance.

### Archivos frontend modificados / creados

| Archivo | Cambio |
|---|---|
| `src/types/auth.types.ts` | `User.pdfDownloadDisabled?: boolean` |
| `src/types/user.types.ts` | `CreateUserRequest` / `UpdateUserRequest` → `pdfDownloadDisabled?: boolean` |
| `src/services/users.service.ts` | `normalizeUser()` mapea `pdfDownloadDisabled` (y acepta `canDownloadPdf` como inverso) |
| `src/hooks/useCurrentUserSync.ts` | **nuevo** — al montar el dashboard hace `authService.getMe()` y refresca el usuario en el store |
| `src/hooks/index.ts` | exporta `useCurrentUserSync` |
| `src/app/(dashboard)/layout.tsx` | llama `useCurrentUserSync()` |
| `src/app/(dashboard)/users/[id]/edit/page.tsx` | casilla de restricción + envío en `updateUser` |
| `src/app/(dashboard)/users/page.tsx` | badge "🚫 PDF" en la lista de usuarios restringidos |
| `src/app/(dashboard)/archives/page.tsx` | modales de visor + enforcement |
| `src/app/(dashboard)/archives/[id]/page.tsx` | enforcement en la vista de detalle |

---

## 4. Lo que el BACKEND debe implementar

La restricción **no tiene efecto** hasta que el backend soporte el campo. Contrato esperado por el
frontend:

### 4.1 Modelo `User`

Agregar un booleano persistente, por defecto `false`:

```
pdfDownloadDisabled: boolean   // true = el usuario NO puede descargar/imprimir PDF
```

El frontend también acepta el nombre inverso `canDownloadPdf: boolean` (lo interpreta como
`pdfDownloadDisabled = !canDownloadPdf`). Elegir **uno** y ser consistente. Se recomienda
`pdfDownloadDisabled`.

### 4.2 Endpoints que deben devolver el campo

El campo debe venir en el objeto `user` de **todas** estas respuestas:

| Endpoint | Uso en frontend |
|---|---|
| `POST /auth/login` → `data.user` | sesión inicial |
| `GET /auth/me` → `data` | refresco en cada carga del dashboard (`useCurrentUserSync`) |
| `GET /users` → `data.data[]` | lista de usuarios (badge) |
| `GET /users/:id` → `data` | pantalla de edición |

### 4.3 Endpoint que debe aceptar el campo (escritura)

```
PATCH /users/:id
Body (parcial): { "pdfDownloadDisabled": true }
```

- Solo `SUPER_ADMIN` debería poder modificarlo.
- Recomendado: rechazar el cambio si el usuario objetivo es `SUPER_ADMIN` (el frontend ya oculta la
  casilla en ese caso, pero conviene validarlo en servidor).
- Debe devolver el `user` actualizado incluyendo `pdfDownloadDisabled`.

`POST /users` (crear) también incluye el campo opcional en el body; si no se envía, `false`.

### 4.4 (Opcional pero recomendado) Enforcement real en servidor

El bloqueo de frontend se puede saltar (devtools, llamar la API directo). Para un bloqueo efectivo:

- En `GET /files/view-url` y en el proxy de descarga: si el usuario autenticado tiene
  `pdfDownloadDisabled = true`, **denegar** la generación de URL de descarga (`Content-Disposition:
  attachment`) y/o responder `403`.
- Opcional: para "ver" permitir una URL con `Content-Disposition: inline` y sin permitir descarga, o
  servir el PDF con marca de agua (usuario + fecha) cuando el que consulta está restringido.

---

## 5. Parte 3 — Creación de archivo sin espera (`/archives/new`)

### Comportamiento nuevo

- Al pulsar **"Guardar Archivo"**, la app:
  1. (solo modo "fotos") genera el PDF localmente en el navegador.
  2. **dispara** la creación del archivo **sin esperar la respuesta** (fire-and-forget).
  3. redirige de inmediato a `/archives`.
- El toast de éxito / error lo sigue mostrando el hook `useArchives.createArchive` de forma global
  (sonner), aunque el usuario ya haya cambiado de página.
- Se quitó el overlay gris de "Guardando..." que bloqueaba la pantalla.

### Estado "creándose" (solo frontend)

- Nuevo store `src/store/creatingArchives.store.ts` (zustand, **no** persistido): lista de `code` de
  archivos cuya creación/subida sigue en curso.
- `/archives/new` hace `add(code)` antes de disparar la creación y `remove(code)` en el `.finally`.
- `/archives` lee esa lista: en la fila cuyo `code` coincide, el botón **"Ver PDF"** queda `disabled` con
  tooltip "Creando archivo…". `openPdf()` también aborta con un toast si el `code` sigue en la lista.
- Si se recarga la página se pierde el estado (y la subida en curso también se aborta): comportamiento
  aceptado.

### Efecto en el BACKEND — orden de llamadas

No hay campos nuevos ni endpoints nuevos. Cambia **cuándo** llegan las llamadas ya existentes:

| Antes | Ahora |
|---|---|
| El front esperaba `POST /archives` **y** `POST /archives/:id/upload-pdf` antes de navegar. | El front navega apenas dispara la secuencia; ambas llamadas ocurren **después** de que el usuario ya está en `/archives`. |

Implicaciones / requisitos para el backend:

1. **Un archivo puede existir unos segundos sin PDF.** `POST /archives` crea el registro y luego
   `POST /archives/:id/upload-pdf` adjunta el PDF. Entre ambas, `GET /archives` y `GET /archives/:id`
   deben devolver el archivo con `pdfUrl` vacío/nulo sin romper (el front ya lo maneja: muestra
   "Sin documento" y, con la parte 3, además deshabilita "Ver PDF" por el estado local).
2. **La subida puede llegar sin que la pestaña siga "mirando".** El request de `upload-pdf` se completa
   igual porque el navegador no lo cancela al hacer `router.push` (navegación SPA, no recarga). Pero si
   el usuario **recarga** o cierra la pestaña durante la subida, el `POST /archives/:id/upload-pdf`
   se aborta → queda un archivo **sin PDF**. Recomendado en backend:
   - permitir reintentar la subida sobre un archivo ya creado (`POST /archives/:id/upload-pdf` idempotente:
     si ya hay PDF, lo reemplaza);
   - opcional: job/endpoint para listar archivos sin `pdfUrl` más antiguos de X minutos y poder
     limpiarlos o marcarlos como incompletos.
3. **El código (`code`) sigue siendo el identificador funcional pre-creación.** El front usa `data.code`
   para marcar el estado "creándose". El backend debe seguir garantizando unicidad de `code` para
   archivos activos y responder **409** si ya existe (el front lo captura y muestra el error en el toast).
4. **Sin cambios** en `POST /archives`, `POST /archives/:id/upload-pdf`, `GET /archives`,
   `GET /archives/:id`, `GET /files/view-url`.

### Archivos frontend modificados / creados (parte 3)

| Archivo | Cambio |
|---|---|
| `src/store/creatingArchives.store.ts` | **nuevo** — store del estado "creándose" |
| `src/store/index.ts` | exporta `useCreatingArchivesStore` |
| `src/app/(dashboard)/archives/new/page.tsx` | creación fire-and-forget + redirect inmediato a `/archives` + `add/remove` del código; se quitó el overlay de "Guardando..." |
| `src/app/(dashboard)/archives/page.tsx` | botón "Ver PDF" `disabled` mientras el `code` esté "creándose"; guarda en `openPdf()` |

---

## 6. Checklist de QA

**Restricción de descarga (parte 2)**

- [ ] `SUPER_ADMIN` ve la casilla en `/users/{id}/edit` de otro usuario; no la ve en su propio perfil ni
      al editar a otro `SUPER_ADMIN`.
- [ ] Al marcar y guardar, `PATCH /users/:id` incluye `pdfDownloadDisabled: true` y responde con el campo.
- [ ] La lista `/users` muestra el badge "PDF" en el usuario restringido.
- [ ] El usuario restringido, tras recargar el dashboard: en `/archives` no ve "Descargar" ni "Abrir en
      pestaña nueva"; el visor no muestra botones de descarga/impresión; `Ctrl+P` no imprime.
- [ ] Un usuario **no** restringido conserva descarga, impresión y "abrir en pestaña nueva".
- [ ] Quitar la casilla restaura todo tras recargar.

**Creación sin espera (parte 3)**

- [ ] Al guardar en `/archives/new` la app va a `/archives` de inmediato, sin overlay de "Guardando...".
- [ ] La fila del archivo nuevo aparece con "Ver PDF" en gris; se habilita solo al terminar la subida.
- [ ] El toast de éxito ("Archivo creado") o de error aparece aunque ya se esté en `/archives`.
- [ ] `code` duplicado → toast de error 409; no se crea el archivo.
- [ ] `GET /archives` / `GET /archives/:id` no rompen mientras el archivo aún no tiene `pdfUrl`.
