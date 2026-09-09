# Notaria Sistema — Backend API

Sistema de gestión de archivos notariales. Backend REST API construido con NestJS, PostgreSQL, Prisma, Redis y almacenamiento de archivos en AWS S3.

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 20.x | Runtime |
| NestJS | 10.x | Framework principal |
| TypeScript | 5.x | Lenguaje |
| PostgreSQL | 16.x | Base de datos |
| Prisma | 5.x | ORM |
| Redis | 7.x | Rate limiting distribuido + denylist de JWT (opcional, fallback in-memory) |
| AWS S3 | — | Almacenamiento de PDFs y comprobantes (URLs prefirmadas) |
| JWT | — | Autenticación (access + refresh, sesión única por dispositivo) |
| Bcrypt | — | Hash de contraseñas |
| Joi | — | Validación de variables de entorno al arranque |
| Swagger/OpenAPI | 7.x | Documentación (solo fuera de producción) |
| Docker | — | Contenedores |
| Winston | — | Logging (rotación diaria de ficheros) |
| pdf-lib / sharp | — | Generación de PDF y procesamiento de imágenes |
| Nodemailer / Resend | — | Envío de correo |
| Multer | — | Recepción de archivos en memoria |

---

## Estructura del Proyecto

```
src/
├── common/
│   ├── decorators/        # @CurrentUser, @RequirePermissions, @RequireRoles, @Public, @ApiPaginatedResponse
│   ├── filters/           # HttpExceptionFilter, PrismaExceptionFilter
│   ├── guards/            # JwtAuthGuard, PermissionsGuard, RolesGuard, UserThrottlerGuard,
│   │                      #   NotarioRestrictionGuard, ProtectSuperAdminGuard
│   ├── health/            # /health, /health/live, /health/ready
│   ├── interceptors/      # TransformInterceptor, LoggingInterceptor, AuditInterceptor
│   ├── redis/             # RedisService, RedisModule, RedisThrottlerStorage
│   ├── s3/                # S3Service (URLs prefirmadas de subida/lectura)
│   ├── security/          # SecurityLoggerService (eventos de seguridad)
│   ├── token-denylist/    # Revocación de access tokens (logout / force-logout)
│   └── utils/             # PaginationUtil, ValidatorsUtil, IdentificationHelper
├── config/
│   ├── app.config.ts
│   ├── jwt.config.ts
│   ├── logger.config.ts
│   ├── upload.config.ts
│   └── env.validation.ts  # Esquema Joi — el arranque falla si el entorno es inválido
├── modules/
│   ├── auth/              # Login, Refresh, Logout, Me, Profile, ChangePassword,
│   │                      #   ResetPassword, UnlockAccount, ForceLogout
│   ├── users/             # CRUD usuarios
│   ├── roles/             # CRUD roles + assign/revoke a usuarios
│   ├── permissions/       # CRUD permisos + grant/revoke a roles
│   ├── archives/          # CRUD archivos notariales + PDF (upload / generate / view)
│   ├── clients/           # CRUD clientes + alta masiva
│   ├── files/             # URLs prefirmadas S3 genéricas (upload-url / view-url)
│   ├── notaries/          # CRUD notarías
│   ├── notifications/     # Mensajería interna (inbox / sent / read)
│   ├── tasks/             # Asignación de tareas entre usuarios
│   ├── news/              # Novedades / anuncios con imagen
│   ├── uafe-forms/        # Formularios "Conozca a su Cliente" (UAFE) + comprobantes
│   ├── logs/              # Consulta de logs de auditoría
│   ├── settings/          # Configuraciones del sistema (clave/valor)
│   └── system/            # Configuración global del sistema (solo SUPER_ADMIN)
└── prisma/
    ├── prisma.service.ts
    └── prisma.module.ts
prisma/
├── schema.prisma          # Modelos de BD
├── migrations/            # Migraciones (incluye índices parciales por SQL crudo)
└── seed.ts                # Datos iniciales
```

---

## Roles y Permisos

| Rol | Alcance |
|---|---|
| **SUPER_ADMIN** | Todo el sistema |
| **NOTARIO** | Gestión de usuarios inferiores, archivos, clientes, roles/permisos (assign/grant), notarías, tareas, novedades y notificaciones |
| **MATRIZADOR** | Solo lectura de archivos y clientes |
| **ARCHIVADOR** | Crear/editar/ver archivos y clientes |

Permisos granulares (`recurso:acción`) definidos en [prisma/seed.ts](prisma/seed.ts):
`users:*`, `roles:*`, `permissions:*`, `archives:*`, `clients:create|read`, `logs:read`, `settings:read|update`.

Guards adicionales:

- **NotarioRestrictionGuard** — impide que un NOTARIO actúe sobre usuarios de rango igual o superior.
- **ProtectSuperAdminGuard** — protege al SUPER_ADMIN de modificación/eliminación.
- **UserThrottlerGuard** — rate limiting con tracker por usuario (JWT) y fallback a IP.

---

## Instalación

### Prerrequisitos

- Node.js 20+
- PostgreSQL 16+ (o Docker)
- Redis 7+ (opcional en single-pod; recomendado)
- Credenciales AWS con acceso a un bucket S3
- npm 9+

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd sistema-notarial-back
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env   # crear si no existe; ver tabla "Variables de Entorno"
# Editar .env con tus valores
```

### 3. Base de datos y migraciones

```bash
npm run prisma:migrate   # crea la BD y aplica migraciones (dev)
npm run prisma:seed      # roles, permisos, settings y super admin
```

### 4. Iniciar en desarrollo

```bash
npm run start:dev
```

API: `http://localhost:3000/api/v1`
Swagger: `http://localhost:3000/api/v1/docs` (deshabilitado si `NODE_ENV=production`)

---

## Variables de Entorno

Validadas con Joi en [src/config/env.validation.ts](src/config/env.validation.ts). El proceso **no arranca** si falta una requerida o el valor es inválido.

| Variable | Descripción | Requerida | Default |
|---|---|---|---|
| `NODE_ENV` | `development` / `production` / `test` | no | `development` |
| `PORT` | Puerto del servidor | no | `3000` |
| `API_PREFIX` | Prefijo de todas las rutas | no | `api/v1` |
| `DATABASE_URL` | URL PostgreSQL (`postgresql://…`) | **sí** | — |
| `JWT_ACCESS_SECRET` | Secreto del access token (mín. 64 chars) | **sí** | — |
| `JWT_REFRESH_SECRET` | Secreto del refresh token (mín. 64, distinto del access) | **sí** | — |
| `JWT_ACCESS_EXPIRATION` | Duración del access token | no | `15m` |
| `JWT_REFRESH_EXPIRATION` | Duración del refresh token | no | `7d` |
| `BCRYPT_ROUNDS` | Rondas de bcrypt (10–14) | no | `12` |
| `CORS_ORIGINS` | Orígenes permitidos CORS (coma-separados) | **sí** | — |
| `THROTTLE_TTL` | Ventana de rate limiting (segundos) | no | `60` |
| `THROTTLE_LIMIT` | Máximo requests por ventana | no | `100` |
| `LOGIN_MAX_ATTEMPTS` | Intentos fallidos consecutivos antes de bloquear la cuenta | no | `5` |
| `SESSION_IDLE_MINUTES` | Minutos de inactividad tras los que una sesión se considera abandonada | no | `15` |
| `UPLOAD_DEST` | Directorio de uploads temporales | no | `./uploads` |
| `MAX_FILE_SIZE` | Tamaño máximo de archivo (bytes) | no | `10485760` (10MB) |
| `AWS_REGION` | Región AWS | no | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Access key AWS | **sí** | — |
| `AWS_SECRET_ACCESS_KEY` | Secret key AWS | **sí** | — |
| `AWS_S3_BUCKET` | Nombre del bucket S3 | **sí** | — |
| `REDIS_URL` | URL Redis (`redis://` o `rediss://`). Sin ella, denylist y rate limiting usan memoria (solo single-pod) | no | — |
| `LOG_LEVEL` | `error` / `warn` / `info` / `debug` / `verbose` | no | `info` |
| `LOG_DIR` | Directorio de logs | no | `./logs` |

---

## Docker

`docker-compose.yml` levanta tres servicios en una red interna: **postgres** (16-alpine), **redis** (7-alpine, con `requirepass`) y **api**. Postgres y Redis **no exponen puertos al host**. La API mapea `EXTERNAL_PORT` (default `8001`) → `PORT` interno (default `8000`).

```bash
# Iniciar todo
docker compose up -d --build

# Ver logs de la API
docker compose logs -f api

# Seed dentro del contenedor
docker compose exec api node prisma/seed.js
```

El contenedor de la API ejecuta `prisma migrate deploy` en el arranque (ver `Dockerfile` `CMD`), corre como usuario no-root (`nestjs`), con `cap_drop: ALL` y límites de CPU/memoria.

---

## Endpoints de la API

Todas las rutas cuelgan de `/{API_PREFIX}` (default `/api/v1`). Autenticación por Bearer JWT salvo las marcadas **Pública**.

### Auth
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/auth/login` | Iniciar sesión (rate limit 5/min) | Pública |
| POST | `/auth/refresh` | Renovar access token (20/min) | Pública |
| POST | `/auth/logout` | Cerrar sesión (revoca token en denylist) | JWT |
| GET | `/auth/me` | Datos del usuario autenticado | JWT |
| PATCH | `/auth/me` | Actualizar datos propios | JWT |
| PATCH | `/auth/profile` | Actualizar perfil | JWT |
| POST | `/auth/change-password` | Cambiar contraseña propia | JWT |
| POST | `/auth/unlock-account` | Desbloquear cuenta por intentos fallidos | SUPER_ADMIN / NOTARIO |
| POST | `/auth/force-logout` | Forzar cierre de sesión de otro usuario | SUPER_ADMIN / NOTARIO |
| POST | `/auth/reset-password` | Resetear contraseña de otro usuario | `users:reset-password` |

### Users
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/users` | `users:read` |
| GET | `/users/:id` | `users:read` |
| POST | `/users` | `users:create` |
| PATCH | `/users/:id` | `users:update` |
| DELETE | `/users/:id` | `users:delete` (soft delete) |

### Roles
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/roles` · `/roles/:id` | `roles:read` |
| POST | `/roles` | `roles:create` |
| PATCH | `/roles/:id` | `roles:update` |
| DELETE | `/roles/:id` | `roles:delete` |
| POST | `/roles/:roleId/assign/:userId` | `roles:assign` |
| DELETE | `/roles/:roleId/revoke/:userId` | `roles:assign` |

### Permissions
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/permissions` · `/permissions/:id` | `permissions:read` |
| POST | `/permissions` | `permissions:create` |
| PATCH | `/permissions/:id` | `permissions:update` |
| DELETE | `/permissions/:id` | `permissions:delete` |
| POST | `/permissions/:permissionId/grant/:roleId` | `permissions:grant` |
| DELETE | `/permissions/:permissionId/revoke/:roleId` | `permissions:grant` |

### Archives
| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/archives` · `/archives/:id` | Listar / obtener | `archives:read` |
| POST | `/archives` | Crear (con otorgantes y beneficiarios) | `archives:create` |
| PATCH | `/archives/:id` | Actualizar | `archives:update` |
| DELETE | `/archives/:id` | Eliminar (soft delete) | `archives:delete` |
| POST | `/archives/:id/upload-pdf` | Subir PDF a S3 (20/min) | `archives:update` |
| POST | `/archives/:id/generate-pdf` | Generar PDF con pdf-lib (10/min) | `archives:update` |
| GET | `/archives/:id/pdf` | URL S3 prefirmada de lectura | `archives:read` |

### Clients
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/clients` · `/clients/:id` | `clients:read` |
| POST | `/clients` | `clients:create` |
| POST | `/clients/bulk` | `clients:create` (alta masiva) |
| PATCH | `/clients/:id` | `clients:update` |
| DELETE | `/clients/:id` | `clients:delete` |

### Files
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/files/upload-url` | URL S3 prefirmada de subida (~10 min, 20/min) | JWT |
| GET | `/files/view-url` | URL S3 prefirmada de lectura (~1 h, 100/min) | JWT |

### Notaries
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/notaries` · `/notaries/:id` | JWT |
| POST · PATCH | `/notaries` · `/notaries/:id` | SUPER_ADMIN / NOTARIO |
| DELETE | `/notaries/:id` | SUPER_ADMIN |

### Notifications
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/notifications` | Enviar notificación | SUPER_ADMIN / NOTARIO |
| GET | `/notifications/inbox` | Recibidas | JWT |
| GET | `/notifications/sent` | Enviadas | SUPER_ADMIN / NOTARIO |
| PATCH | `/notifications/read-all` | Marcar todas leídas | JWT |
| PATCH | `/notifications/:id/read` | Marcar una leída | JWT |
| DELETE | `/notifications/:id` | Eliminar | JWT |

### Tasks
| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| POST | `/tasks` | Asignar tarea | SUPER_ADMIN / NOTARIO |
| GET | `/tasks/received` | Tareas recibidas | JWT |
| GET | `/tasks/assigned` | Tareas asignadas | SUPER_ADMIN / NOTARIO |
| PATCH | `/tasks/:id/status` | Cambiar estado | JWT |
| PATCH | `/tasks/:id/read` | Marcar leída | JWT |
| DELETE | `/tasks/:id` | Eliminar | JWT |

### News
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/news` · `/news/:id` | JWT |
| POST · PATCH | `/news` · `/news/:id` | SUPER_ADMIN / NOTARIO (imágenes ≤ 5MB, validación de magic bytes) |
| DELETE | `/news/:id` | SUPER_ADMIN |

### UAFE Forms ("Conozca a su Cliente")
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/uafe-forms` · `/uafe-forms/:id` | Listar / obtener (JSON + campos desnormalizados para filtrar) |
| POST | `/uafe-forms` | Crear formulario |
| PATCH | `/uafe-forms/:id` | Actualizar |
| DELETE | `/uafe-forms/:id` | Eliminar |
| POST | `/uafe-forms/:id/comprobantes` | Adjuntar comprobante en S3 (20/min) |
| DELETE | `/uafe-forms/:id/comprobantes/:comprobanteId` | Eliminar comprobante |

> El JSON del formulario **nunca** almacena base64 de comprobantes; los ficheros van a S3 y solo se guarda la `s3Key`.

### System / Settings / Logs
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/system/config` | JWT |
| PATCH | `/system/config` | SUPER_ADMIN |
| GET | `/settings` · `/settings/:key` | `settings:read` |
| PATCH | `/settings/:key` · `/settings` | `settings:update` |
| GET | `/logs` | `logs:read` |

### Health
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health/live` | Liveness (sin dependencias) |
| GET | `/health/ready` | Readiness (BD + Redis) |
| GET | `/health` | Estado agregado |

Documentación completa e interactiva en Swagger: `/{API_PREFIX}/docs`.

---

## Credenciales Iniciales

```
Email:    admin@notaria.com
Password: Admin123!
```

> ⚠️ Cambiar la contraseña inmediatamente después del primer acceso.

---

## Seguridad

- Contraseñas hasheadas con **bcrypt** (12 rondas por defecto).
- **Access token corto** (15 min) + refresh token en BD con revocación.
- **Denylist de tokens** (Redis o memoria): `logout` y `force-logout` invalidan el access token al instante.
- **Sesión única por dispositivo**: claim `epoch` en el JWT; si no coincide con `User.sessionEpoch` el token se rechaza. Un segundo login se rechaza (409) mientras la sesión original siga viva dentro de `SESSION_IDLE_MINUTES`.
- **Bloqueo de cuenta** tras `LOGIN_MAX_ATTEMPTS` (5) intentos fallidos consecutivos; desbloqueo vía `POST /auth/unlock-account` (SUPER_ADMIN / NOTARIO).
- **`AuditInterceptor`**: persiste una fila en `logs` por cada mutación, búsqueda, descarga o acción de auth, con redacción de campos sensibles (`password`, `token`, `secret`, `otp`, …) y truncado de payloads.
- **`SecurityLoggerService`**: registro dedicado de eventos de seguridad.
- **Helmet** con CSP estricta, HSTS (producción), `frameguard: deny`, CORP `same-site`.
- **Compression** deshabilitada en rutas `/auth/*` (mitigación BREACH).
- **Rate limiting** Redis-backed, distribuido entre pods, con tracker por usuario y apriete por ruta (`@Throttle`).
- **CORS** por entorno, con `exposedHeaders` de rate-limit para backoff del front.
- **Validación estricta** de todos los inputs con `class-validator` (`whitelist` + `forbidNonWhitelisted`, sin coerción implícita de tipos).
- **Sin acceso estático a `/uploads`**: los PDFs y comprobantes se sirven solo mediante URLs S3 prefirmadas y autenticadas.
- **`User.pdfDownloadDisabled`**: cuando es `true`, el usuario no puede descargar / imprimir / abrir el PDF en pestaña nueva.
- **Soft delete** en usuarios y archivos; índice único parcial sobre `archives.code` (solo filas activas).
- Contenedores Docker con usuario no-root, `cap_drop: ALL` y límites de recursos.

---

## Guía de Deploy en Producción

1. Configurar todas las variables de entorno con valores seguros (S3, Redis, secretos JWT).
2. Secretos JWT de **mínimo 64 caracteres** aleatorios y distintos entre sí.
3. `CORS_ORIGINS` con los dominios reales del frontend.
4. `NODE_ENV=production` (deshabilita Swagger, activa HSTS y `trust proxy`).
5. Migraciones: `npm run prisma:migrate:prod` (o automáticas al arrancar el contenedor).
6. Seed inicial: `npm run prisma:seed`.
7. Levantar con `docker compose up -d --build` detrás de Nginx / Cloudflare.

```bash
# Generar secretos seguros
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Desarrollo

```bash
npm run start:dev        # hot-reload
npm run prisma:studio    # GUI de la BD
npm run prisma:generate  # regenerar cliente Prisma
npm run format           # Prettier
npm run lint             # ESLint --fix
npm run test             # unit
npm run test:e2e         # e2e
npm run test:cov         # cobertura
```
