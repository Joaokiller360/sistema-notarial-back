# Formularios UAFE ("Conozca a su Cliente") + Página inicial por rol

**Fecha:** 2026-09-03
**Ámbito:** Frontend (`notaria-sistema-front`). Documento para el equipo de backend.

---

## 0. Resumen

1. **Módulo Formularios UAFE** (`/forms`, `/forms/plantillas`, `/forms/nuevo/uafe-principal`,
   `/forms/uafe/:id`). Hoy **todo se guarda en `localStorage`** del navegador
   (`key: "notaria_uafe_forms"`). No hay backend. Este documento entrega el **modelo de datos completo**
   y los **endpoints sugeridos** para persistirlo en el servidor.
2. **Página inicial según rol** — el usuario con rol **`MATRIZADOR`** (y sin `SUPER_ADMIN`/`NOTARIO`)
   aterriza en `/forms` en vez de `/dashboard`. Requiere que el **JWT incluya el claim `roles`**.

---

## 1. Módulo Formularios UAFE

### 1.1 Qué es

Formulario de debida diligencia UAFE (Política "Conozca a su Cliente") de la Notaría Pública Primera
del Cantón Esmeraldas. El usuario:

- elige una plantilla en `/forms/plantillas` (**hoy solo existe una: `uafe-principal`**),
- llena el formulario en `/forms/nuevo/uafe-principal`,
- lo guarda (→ `localStorage`),
- puede verlo/editarlo en `/forms/uafe/:id`,
- puede **imprimirlo / exportarlo a PDF** (todo client-side, `window.print()` + CSS de impresión).

### 1.2 Modelo de datos

Cada envío guardado es un `UafeSubmission`:

```ts
interface UafeSubmission {
  id: string;                 // uuid
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  filledByName: string;       // nombre de quien llenó el formulario
  filledByEmail: string;
  filledByRole: string;       // rol del usuario que llenó (p. ej. "MATRIZADOR")
  templateId: string;         // "uafe-principal"
  templateName: string;       // "UAFE — Conozca a su cliente"
  data: UafeFormData;         // ↓ todo el contenido del formulario
}
```

```ts
interface CuentaBancaria {
  institucion: string;
  tipoCuenta: "ahorros" | "corriente" | string;
  numero: string;
  titular: string;
}

interface UafeFormData {
  // 1. Información general del trámite
  lugar: string;
  fecha: string;              // YYYY-MM-DD
  hora: string;               // HH:mm
  tipoTramite: "" | "protocolo" | "diligencia";
  actoContrato: string;       // clave: compraventa_inmueble, hipoteca, mutuo, ... (lista abajo)
  rolCompareciente: string;   // comprador | vendedor | acreedor | deudor | cedente | cesionario | socio | otro

  // 2. Datos del compareciente
  tipoPersona: "natural" | "juridica";
  nombres: string;            // nombres y apellidos, o razón social
  tipoId: "cedula" | "pasaporte" | "ruc";
  numeroId: string;
  nacionalidad: string;       // nombre del país (p. ej. "Ecuador")
  genero: "" | "masculino" | "femenino";
  direccion: string;
  telefono: string;
  email: string;
  actividadEconomica: string;
  ocupacion: string;
  entidadTrabajo: string;
  cargo: string;
  estadoCivil: "soltero" | "casado" | "union_libre" | "divorciado" | "viudo";
  conyugeNombres: string;
  conyugeId: string;

  // 3. Representante legal / apoderado
  repAplica: boolean;
  repNombres: string;
  repTipoId: "cedula" | "pasaporte";
  repNumeroId: string;
  repLugarFechaNacimiento: string;
  repPoderNotaria: string;
  repPoderProtocoloFecha: string;

  // 4. Información del bien
  tipoBien: string;           // ninguno | casa | departamento | terreno | finca | local | oficina | vehiculo | vehiculo_pesado | embarcacion | maquinaria
  descripcionBien: string;

  // 5. Aspectos económicos y origen de fondos
  cuantia: string;            // número como string (USD)
  avaluo: string;             // número como string (USD)
  ciudadFechaPago: string;    // CIUDAD de pago (el nombre viejo se mantiene por compatibilidad)
  fechaPago: string;          // NUEVO — fecha de pago, YYYY-MM-DD
  moneda: string;             // NUEVO — código ISO 4217, por defecto "USD"
  origenFondos: string;       // sueldo | actividad_comercial | honorarios | ahorros | venta_inmueble | ... | otro
  origenDetalle: string;      // texto libre si origenFondos === "otro"
  formaPago: string;          // transferencia | cheque_certificado | cheque_personal | efectivo | permuta | financiado | compensacion
  adjuntaComprobante: boolean;// se marca solo si formaPago ∈ {transferencia, cheque_*}
  comprobantes: string[];     // NUEVO — 1 a 5 imágenes de comprobantes (ver 1.4)
  cuentaOrigen: CuentaBancaria;
  cuentaDestino: CuentaBancaria;
  terceroInterviene: boolean;
  terceroMotivo: string;
  terceroId: string;
  terceroNombre: string;

  // 6. Declaración PEP
  esPep: "si" | "no";
  pepCargo: string;
  pepFuncion: string;
  pepJerarquia: string;
  pepTieneRelacion: boolean;
  pepAsociadoNombres: string;

  // 8. Uso exclusivo notaría
  nivelRiesgo: "" | "bajo" | "medio" | "alto" | "critico"; // NUEVO — uso interno, NO se imprime en el PDF
  matrizadorTipo: "" | "protocolo" | "diligencial";        // NUEVO — reemplaza los 2 booleanos anteriores
  matrizadorNombre: string;
}
```

**Valores de `actoContrato`:** `compraventa_inmueble`, `compraventa_vehiculo`, `promesa_compraventa`,
`permuta`, `donacion`, `cesion_derechos`, `hipoteca`, `cancelacion_hipoteca`, `mutuo`,
`reconocimiento_deuda`, `acuerdo_pago`, `constitucion_compania`, `aumento_capital`, `fideicomiso`,
`liquidacion_conyugal`, `adjudicacion_bienes`, `otro`.

### 1.3 Cambios de esta entrega respecto al modelo anterior

| Campo | Cambio |
|---|---|
| `fechaPago` | **NUEVO** — antes "Ciudad y fecha de pago" era un solo texto; ahora `ciudadFechaPago` = solo ciudad y `fechaPago` = fecha (date). |
| `moneda` | **NUEVO** — selector con buscador (ISO 4217). Por defecto `"USD"`. |
| `nivelRiesgo` | **NUEVO** — nivel de alerta/riesgo interno de cumplimiento. **No se imprime en el PDF.** Se muestra en la lista `/forms` con un punto de color. |
| `matrizadorTipo` | **NUEVO** — sustituye a `matrizadorProtocolo: boolean` + `matrizadorDiligencial: boolean` (que se eliminaron). Solo un valor: `protocolo` o `diligencial`. |
| `comprobantes` | **NUEVO** — imágenes de comprobantes de pago (1–5). |

> Migración de datos viejos (el front ya lo hace en cliente): `matrizadorProtocolo → "protocolo"`,
> `matrizadorDiligencial → "diligencial"`; `moneda` ausente → `"USD"`; `fechaPago`/`nivelRiesgo`
> ausentes → `""`.

### 1.4 Comprobantes (`comprobantes: string[]`)

- Hoy en el front: **entre 1 y 5** imágenes JPG/PNG. El navegador las reduce (máx. lado 1000 px,
  JPEG calidad 0.7) y las guarda como **data URL base64** (`data:image/jpeg;base64,...`) dentro del JSON
  en `localStorage`.
- Sirven para anexarlas al final del PDF impreso, en hojas aparte.
- **Para el backend:** NO recibir base64 en el JSON. Exponer subida de archivos:
  - `POST /uafe-forms/:id/comprobantes` (multipart, hasta 5 imágenes) → devuelve ids/URLs.
  - `DELETE /uafe-forms/:id/comprobantes/:comprobanteId`.
  - En `GET` devolver `comprobantes` como lista de `{ id, url }` (URL firmada temporal, como con los
    PDFs de archivos).
- Límite: 5 por formulario. Validar tipo `image/jpeg | image/png` y tamaño (p. ej. 10 MB antes de
  redimensionar).

### 1.5 Endpoints sugeridos

Prefijo propuesto: `/uafe-forms` (o `/forms/uafe`).

| Método | Ruta | Uso frontend |
|---|---|---|
| `GET` | `/uafe-forms` | Lista (`/forms`). Soporta filtros: `search`, `nacionalidad`, `nivelRiesgo`, `page`, `limit`. Orden por `createdAt desc`. |
| `GET` | `/uafe-forms/:id` | Ver / editar (`/forms/uafe/:id`). |
| `POST` | `/uafe-forms` | Crear. Body: `{ templateId, templateName, data }`. El backend rellena `filledBy*` desde el usuario autenticado y `createdAt/updatedAt/id`. |
| `PATCH` | `/uafe-forms/:id` | Actualizar. Body: `{ data }`. |
| `DELETE` | `/uafe-forms/:id` | Eliminar. |
| `POST` | `/uafe-forms/:id/comprobantes` | Subir 1–5 imágenes (multipart). |
| `DELETE` | `/uafe-forms/:id/comprobantes/:cid` | Quitar una imagen. |

Respuesta estándar del proyecto: `{ success, data, message?, timestamp }`.
Paginado: `{ data: [...], total, page, limit, totalPages }`.

**Permisos sugeridos:** cualquier usuario autenticado puede crear/ver/editar sus formularios;
`SUPER_ADMIN` / `NOTARIO` ven todos; `MATRIZADOR` / `ARCHIVADOR` ven los propios (a definir por negocio).

### 1.6 Plantillas

- Hoy **solo existe la plantilla `uafe-principal`** ("UAFE — Conozca a su cliente"). Se eliminó la
  variante `uafe-diligencia`.
- Si el backend gestiona plantillas: `GET /uafe-templates` → `[{ id, name, description, principal }]`.
  Mientras tanto la lista está fija en el front (`src/lib/form-templates.ts`).

### 1.7 Ejemplos sembrados (solo front, informativo)

El front tiene un botón "Cargar 3 ejemplos" que inserta 3 `UafeSubmission` completos en `localStorage`
(compraventa de inmueble, hipoteca de empresa, mutuo con PEP). Se identifican por
`filledByEmail === "ejemplos@notaria.local"`. **No** deben migrarse al backend; es data de demo.

### 1.8 Filtros de la lista `/forms`

La UI ya filtra en cliente por:
- **texto** (nombre del compareciente, identificación, quien llenó),
- **nacionalidad** (`data.nacionalidad`).

Al conectar el backend, mover estos filtros a query params de `GET /uafe-forms`
(`search`, `nacionalidad`).

---

## 2. Página inicial según rol

### 2.1 Comportamiento

- Al iniciar sesión o al entrar a `/`, el usuario con rol **`MATRIZADOR`** que **no** tenga además
  `SUPER_ADMIN` ni `NOTARIO` es redirigido a **`/forms`**.
- El resto de roles siguen yendo a **`/dashboard`**.
- **No cambia ningún permiso**: el matrizador sigue pudiendo navegar a cualquier sección a la que ya
  tenga acceso; solo cambia la pantalla de aterrizaje.

### 2.2 Requisito para el BACKEND

- El **JWT de acceso** debe incluir el claim **`roles: string[]`** con los valores
  `"SUPER_ADMIN" | "NOTARIO" | "MATRIZADOR" | "ARCHIVADOR"`.
- El `middleware.ts` de Next decodifica el JWT (sin verificar firma, solo lee claims) para elegir la
  ruta de aterrizaje. Si el claim `roles` falta o el token es ilegible → cae a `/dashboard` (sin romper).
- La respuesta de `POST /auth/login` ya devuelve `user.roles`; eso se usa además para el redirect
  inmediato tras el login en el cliente.

### 2.3 Archivos frontend tocados

| Archivo | Cambio |
|---|---|
| `src/middleware.ts` | Nueva `landingPath(token)`: decodifica `roles` del JWT y redirige el matrizador puro a `/forms`. |
| `src/hooks/useAuth.ts` | Tras `login()`, `router.push` a `/forms` o `/dashboard` según `user.roles`. |
| `src/lib/form-templates.ts` | Se dejó solo la plantilla `uafe-principal`. |
| `src/lib/uafe-forms.ts` | Modelo `UafeFormData` con los campos nuevos + migración de datos viejos. |
| `src/components/forms/UafeForm.tsx` | Campos nuevos, nivel de riesgo en la barra superior, comprobantes, moneda con buscador, etc. |
| `src/app/(dashboard)/forms/page.tsx` | Columna "Nivel" con punto de color, barra de color por fila, filtro por nacionalidad. |

---

## 3. Checklist de QA

- [ ] `GET /uafe-forms` devuelve lista paginada; filtros `search` y `nacionalidad` funcionan.
- [ ] `POST /uafe-forms` guarda `data` completo (todos los campos nuevos incluidos).
- [ ] `PATCH /uafe-forms/:id` actualiza y respeta `matrizadorTipo` (uno solo).
- [ ] `nivelRiesgo` se guarda pero **no** aparece en el PDF impreso.
- [ ] Subida de comprobantes: 1–5 imágenes, rechaza el 6.º y tipos no imagen.
- [ ] Login como `MATRIZADOR` puro → aterriza en `/forms`. Login como `NOTARIO`/`SUPER_ADMIN`/`ARCHIVADOR` → `/dashboard`.
- [ ] `MATRIZADOR` puede seguir abriendo manualmente `/archives`, `/clients`, etc. si su rol lo permitía.
- [ ] JWT de acceso trae `roles`; si se quita, el redirect cae a `/dashboard` sin error.
