# Notaria Sistema — Backend API

Sistema de gestión de archivos notariales. Backend REST API construido con NestJS, PostgreSQL y Prisma.

---

## Stack Tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| Node.js | 20.x | Runtime |
| NestJS | 10.x | Framework principal |
| TypeScript | 5.x | Lenguaje |
| PostgreSQL | 16.x | Base de datos |
| Prisma | 5.x | ORM |
| JWT | — | Autenticación |
| Bcrypt | — | Hash de contraseñas |
| Swagger/OpenAPI | 7.x | Documentación |
| Docker | — | Contenedores |
| Winston | — | Logging |
| Multer | — | Upload de archivos |

---

## Estructura del Proyecto

```
src/
├── common/
│   ├── decorators/        # @CurrentUser, @RequirePermissions, @RequireRoles, @Public
│   ├── filters/           # HttpExceptionFilter, PrismaExceptionFilter
│   ├── guards/            # JwtAuthGuard, PermissionsGuard, RolesGuard
│   ├── health/            # Health check endpoint
│   ├── interceptors/      # TransformInterceptor, LoggingInterceptor
│   └── utils/             # PaginationUtil, ValidatorsUtil
├── config/
│   ├── app.config.ts
│   ├── jwt.config.ts
│   ├── logger.config.ts
│   └── upload.config.ts
├── modules/
│   ├── auth/              # Login, Refresh, Logout, ChangePassword, ResetPassword
│   ├── users/             # CRUD usuarios
│   ├── roles/             # CRUD roles + assign/revoke
│   ├── permissions/       # CRUD permisos + grant/revoke
│   ├── archives/          # CRUD archivos notariales + PDF upload
│   ├── logs/              # Consulta de logs del sistema
│   └── settings/          # Configuraciones del sistema
└── prisma/
    ├── prisma.service.ts
    └── prisma.module.ts
prisma/
├── schema.prisma          # Modelos de BD
└── seed.ts                # Datos iniciales
```

---

## Roles y Permisos

| Rol | Permisos |
|---|---|
| **SUPER_ADMIN** | Todo el sistema |
| **NOTARIO** | Crear usuarios inferiores, gestionar archivos, asignar roles |
| **MATRIZADOR** | Solo lectura de archivos + cambiar su contraseña |
| **ARCHIVADOR** | Crear/editar/ver archivos + cambiar su contraseña |

---

## Instalación

### Prerrequisitos

- Node.js 20+
- PostgreSQL 16+ (o Docker)
- npm 9+

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd notaria-sistema
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Base de datos y migraciones

```bash
# Crear la base de datos y ejecutar migraciones
npm run prisma:migrate

# Cargar datos iniciales (roles, permisos, admin)
npm run prisma:seed
```

### 4. Iniciar en desarrollo

```bash
npm run start:dev
```

La API estará disponible en: `http://localhost:3000/api/v1`

Swagger docs en: `http://localhost:3000/api/v1/docs`

---

## Variables de Entorno

| Variable | Descripción | Default |
|---|---|---|
| `NODE_ENV` | Entorno (development/production) | `development` |
| `PORT` | Puerto del servidor | `3000` |
| `API_PREFIX` | Prefijo de todas las rutas | `api/v1` |
| `DATABASE_URL` | URL de conexión a PostgreSQL | — |
| `JWT_ACCESS_SECRET` | Clave secreta del access token | — |
| `JWT_ACCESS_EXPIRATION` | Duración del access token | `15m` |
| `JWT_REFRESH_SECRET` | Clave secreta del refresh token | — |
| `JWT_REFRESH_EXPIRATION` | Duración del refresh token | `7d` |
| `BCRYPT_ROUNDS` | Rondas de bcrypt | `12` |
| `CORS_ORIGINS` | Orígenes permitidos CORS (coma-separados) | `http://localhost:3000` |
| `THROTTLE_TTL` | Ventana de rate limiting (segundos) | `60` |
| `THROTTLE_LIMIT` | Máximo requests por ventana | `100` |
| `UPLOAD_DEST` | Directorio de uploads | `./uploads` |
| `MAX_FILE_SIZE` | Tamaño máximo de archivo (bytes) | `10485760` (10MB) |
| `LOG_LEVEL` | Nivel de logging | `debug` |
| `LOG_DIR` | Directorio de logs | `./logs` |

---

## Docker

### Desarrollo con Docker

```bash
# Iniciar con Docker Compose
docker compose up -d

# Ver logs
docker compose logs -f api

# Ejecutar seed dentro del contenedor
docker compose exec api npx ts-node prisma/seed.ts
```

### Producción

```bash
# Build de imagen
docker build -t notaria-api .

# O con compose
docker compose -f docker-compose.yml up -d --build
```

---

## Endpoints de la API

### Auth
| Método | Ruta | Descripción | Autenticación |
|---|---|---|---|
| POST | `/auth/login` | Iniciar sesión | Pública |
| POST | `/auth/refresh` | Renovar access token | Pública |
| POST | `/auth/logout` | Cerrar sesión | JWT |
| POST | `/auth/change-password` | Cambiar contraseña propia | JWT |
| POST | `/auth/reset-password` | Resetear contraseña de otro usuario | JWT + Permiso |

### Users
| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/users` | Listar usuarios | `users:read` |
| GET | `/users/:id` | Obtener usuario | `users:read` |
| POST | `/users` | Crear usuario | `users:create` |
| PATCH | `/users/:id` | Actualizar usuario | `users:update` |
| DELETE | `/users/:id` | Eliminar usuario | `users:delete` |

### Archives
| Método | Ruta | Descripción | Permiso |
|---|---|---|---|
| GET | `/archives` | Listar archivos | `archives:read` |
| GET | `/archives/:id` | Obtener archivo | `archives:read` |
| POST | `/archives` | Crear archivo | `archives:create` |
| PATCH | `/archives/:id` | Actualizar archivo | `archives:update` |
| DELETE | `/archives/:id` | Eliminar archivo | `archives:delete` |
| POST | `/archives/:id/upload-pdf` | Subir PDF | `archives:update` |
| GET | `/archives/:id/pdf` | Ver PDF | `archives:read` |

### Roles, Permissions, Logs, Settings

Consulta la documentación Swagger completa en `/api/v1/docs`.

---

## Credenciales Iniciales

```
Email:    admin@notaria.com
Password: Admin123!
```

> ⚠️ Cambiar la contraseña inmediatamente después del primer acceso.

---

## Seguridad

- Contraseñas hasheadas con **bcrypt** (12 rondas)
- Tokens JWT con expiración corta (15min)
- Refresh tokens almacenados en DB con revocación
- **Helmet** para headers de seguridad HTTP
- **Rate limiting** configurable
- **CORS** configurable por entorno
- Validación estricta de todos los inputs con class-validator
- **Soft delete** en usuarios y archivos
- Logs de auditoría de todas las acciones críticas
- Usuario no-root en Docker

---

## Guía de Deploy en Producción

1. Configurar todas las variables de entorno con valores seguros
2. Usar secretos JWT de mínimo 64 caracteres aleatorios
3. Configurar `CORS_ORIGINS` con los dominios del frontend
4. Cambiar `NODE_ENV=production` (deshabilita Swagger)
5. Ejecutar migraciones: `npm run prisma:migrate:prod`
6. Ejecutar seed: `npm run prisma:seed`
7. Iniciar con Docker Compose o PM2

```bash
# Generar secretos seguros
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Desarrollo

```bash
# Modo desarrollo con hot-reload
npm run start:dev

# Prisma Studio (GUI para BD)
npm run prisma:studio

# Formatear código
npm run format

# Lint
npm run lint

# Tests
npm run test
npm run test:cov
```
