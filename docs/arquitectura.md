# Arquitectura y funcionamiento — Mundial 2026 Ticketing

## Que es el sistema

Sistema cliente/servidor de venta, transferencia y validacion de entradas para el Mundial 2026. Permite a usuarios comprar entradas, generar QR dinamicos para acceder al estadio, transferir entradas a otros usuarios y validarlas en puerta mediante un funcionario con dispositivo autorizado.

---

## Estructura del repositorio

```
Obligatorio-BDII/
├── sql/
│   ├── 01_schema_neon.sql        # Tablas, tipos y constraints
│   ├── 02_triggers_functions.sql # Triggers, funciones PL/pgSQL y vistas
│   └── 02_seed_data.sql          # Datos de prueba (paises, estadios, equipos, usuarios)
│
├── WorldCupTicketing.Api/        # Backend ASP.NET Core 8
│   ├── Program.cs                # Configuracion de la app (JWT, CORS, DI, rutas)
│   ├── appsettings.json          # Configuracion (JWT key, logging)
│   ├── Data/
│   │   └── DbConnectionFactory.cs   # Fabrica de conexiones a PostgreSQL
│   ├── Services/
│   │   └── JwtService.cs            # Generacion de tokens JWT
│   ├── Models/
│   │   └── Models.cs                # Records de request (DTO de entrada)
│   └── Endpoints/
│       ├── AuthEndpoints.cs         # /auth/register, /auth/login, /auth/me
│       ├── EventoEndpoints.cs       # /eventos, /equipos, /estadios
│       ├── VentaEndpoints.cs        # /ventas
│       ├── EntradaEndpoints.cs      # /entradas/mis-entradas, /entradas/{id}/qr
│       ├── TransferEndpoints.cs     # /transferencias
│       ├── ValidacionEndpoints.cs   # /validaciones
│       ├── AdminEndpoints.cs        # /admin/*
│       ├── StatsEndpoints.cs        # /stats/*
│       └── EndpointHelpers.cs       # Extensiones de ClaimsPrincipal y NpgsqlException
│
├── worldcup-frontend/            # Frontend Next.js 14
│   ├── app/
│   │   ├── layout.tsx               # Layout global con Navbar
│   │   ├── page.tsx                 # Home: lista de eventos
│   │   ├── evento/[id]/page.tsx     # Detalle de evento + compra
│   │   ├── mis-entradas/page.tsx    # Entradas del usuario + QR + transferencia
│   │   ├── mis-compras/page.tsx     # Historial de compras
│   │   ├── transferencias/page.tsx  # Transferencias enviadas y recibidas
│   │   ├── validar/page.tsx         # Validacion de QR (funcionario)
│   │   ├── admin/page.tsx           # Dashboard admin (stats + usuarios)
│   │   ├── admin/eventos/page.tsx   # Crear eventos y sectores
│   │   ├── auth/login/page.tsx      # Login
│   │   └── auth/register/page.tsx   # Registro de usuario
│   ├── components/
│   │   ├── Navbar.tsx               # Barra de navegacion con deteccion de rol
│   │   └── QrDisplay.tsx            # Componente QR con auto-renovacion cada 29s
│   └── lib/
│       └── api.ts                   # Cliente HTTP, manejo de sesion, helpers
│
├── tests/
│   └── smoke.ps1                 # Tests de humo automatizados (PowerShell)
│
└── docs/
    ├── arquitectura.md           # Este documento
    └── prueba-manual.md          # Guia de prueba paso a paso
```

---

## Stack tecnologico

| Capa | Tecnologia | Razon |
| --- | --- | --- |
| Base de datos | PostgreSQL 15 en Neon (cloud) | Soporte completo de triggers, funciones PL/pgSQL y tipos enum |
| Backend | ASP.NET Core 8 Minimal API | API liviana sin controllers, poco boilerplate |
| ORM | Dapper | Mapeo SQL-objeto ligero, permite escribir SQL directo |
| Driver DB | Npgsql 10 | Driver oficial de PostgreSQL para .NET |
| Autenticacion | JWT Bearer (HMAC-SHA256) | Stateless, facil de consumir desde Next.js |
| Frontend | Next.js 14 con TypeScript | App Router, rendering del lado del cliente para paginas interactivas |
| Estilos | Tailwind CSS | Clases utilitarias, sin CSS separado |

---

## Modelo de base de datos

### Jerarquia de usuarios

Todos los usuarios tienen una fila en `usuario` (datos personales y password). Segun su rol, tambien tienen una fila en una tabla especializada:

```
usuario (mail PK, doc, direccion, password_hash)
    ├── administrador  (mail FK, id_pais_gestionado)
    ├── funcionario    (mail FK, nro_legajo)
    └── usuario_general (mail FK, estado_verif: pendiente | verificado | rechazado)
```

Un usuario puede tener un solo rol principal. El login detecta en cual tabla aparece y arma el JWT con los roles correspondientes.

### Entidades principales

```
pais_sede ──< estadio ──< sector
                 │
                 └──< evento ──< evento_sector (cupo por sector por evento)
                          │
                          └──< entrada ──< qr_token
                                  │            │
                                  └──< transfer └──< validacion
                          │
                     venta (agrupa entradas de una compra)
```

### Tablas clave

| Tabla | Descripcion | Columnas importantes |
| --- | --- | --- |
| `usuario` | Base de todos los usuarios | `mail` (PK), `password_hash`, datos personales |
| `usuario_general` | Usuarios que compran entradas | `estado_verif` (pendiente/verificado/rechazado) |
| `administrador` | Admin de un pais sede | `id_pais_gestionado` (solo puede crear eventos en su pais) |
| `funcionario` | Valida entradas en puerta | `nro_legajo` |
| `evento` | Partido entre dos equipos | `id_estadio`, `fecha_hora`, `estado`, `mail_admin` |
| `evento_sector` | Cupo disponible por sector en un evento | `cupo_maximo`, `entradas_emitidas` |
| `venta` | Compra de entradas | `mail_usuario`, `monto_total`, `comision_pct` |
| `entrada` | Entrada individual | `mail_propietario`, `estado`, `transferencias_rest` (max 3) |
| `transfer` | Solicitud de transferencia entre usuarios | `mail_remitente`, `mail_destinat`, `estado` |
| `qr_token` | Token QR de 30 segundos de vida | `codigo_hash`, `fecha_expiracion`, `activo` |
| `validacion` | Registro de acceso al estadio | `id_entrada` UNIQUE (solo se valida una vez) |
| `dispositivo` | Tablet/dispositivo autorizado de un funcionario | `mail_funcionario`, `activo` |
| `comision_historico` | Historial de comisiones aplicadas | `porcentaje`, `fecha_fin NULL = vigente` |

### Enums

```sql
sector_nombre_enum  → A | B | C | D
evento_estado_enum  → programado | activo | cancelado | finalizado
venta_estado_enum   → pendiente | pagada | cancelada
entrada_estado_enum → disponible | usada | cancelada
transfer_estado_enum → pendiente | aceptada | rechazada | cancelada
estado_verif_enum   → pendiente | verificado | rechazado
```

---

## Logica de negocio en la base de datos

Toda la logica critica vive en la DB, no en el backend. Esto garantiza integridad aunque se conecten multiples clientes.

### Triggers

#### `trg_controlar_insert_entrada` (BEFORE INSERT ON entrada)

Ejecutado antes de cada nueva entrada. Hace dos cosas:

1. Cuenta entradas no canceladas del mismo usuario para el mismo evento. Si ya tiene 5, lanza excepcion.
2. Incrementa `entradas_emitidas` en `evento_sector` solo si `entradas_emitidas < cupo_maximo`. Si el cupo esta lleno, lanza excepcion.

```
INSERT INTO entrada → trigger → ¿usuario ya tiene >= 5 entradas para este evento? → SI → ROLLBACK con error
                              → ¿hay cupo en el sector? → NO → ROLLBACK con error
                              → INSERT + UPDATE evento_sector (maximo 5 por usuario por evento)
```

#### `trg_check_evento_solapado` (BEFORE INSERT OR UPDATE ON evento)

Antes de crear o modificar un evento, verifica que no exista otro evento en el mismo estadio dentro de una ventana de ±3 horas, excluyendo eventos cancelados o finalizados.

#### `trg_validar_insert_transferencia` (BEFORE INSERT ON transfer)

Antes de crear una transferencia verifica: que el remitente sea el propietario actual, que la entrada este disponible (no usada ni cancelada) y que tenga transferencias restantes.

### Funciones PL/pgSQL

#### `generar_qr_token(p_id_entrada INT)`

1. Verifica que la entrada exista y este en estado `disponible`.
2. Marca como inactivos todos los QR anteriores de esa entrada.
3. Genera un hash aleatorio de 32 bytes con `gen_random_bytes(32)` de `pgcrypto`.
4. Inserta un nuevo `qr_token` con `fecha_expiracion = now() + 30 seconds`.
5. Retorna `(id_token, codigo_hash, fecha_expiracion)`.

```
GET /entradas/{id}/qr
    → backend llama SELECT * FROM generar_qr_token(@id)
    → funcion invalida QR anterior + crea nuevo con vida de 30s
    → backend genera imagen PNG con QRCoder y la codifica en base64
    → responde { codigoHash, qrBase64, fechaExpiracion }
```

#### `validar_entrada(p_hash TEXT, p_mail_func VARCHAR, p_disp INT)`

Funcion completa de acceso al estadio con bloqueo optimista (`FOR UPDATE`):

1. Busca el `qr_token` por hash. Si no existe → `ERROR: QR inexistente`.
2. Si el token no esta activo → `ERROR: QR inactivo`.
3. Si `fecha_expiracion < now()` → marca inactivo y devuelve `ERROR: QR expirado`.
4. Bloquea la entrada con `FOR UPDATE` para evitar race conditions.
5. Si la entrada no esta `disponible` → error.
6. Si ya existe una fila en `validacion` para esa entrada → `ERROR: Entrada ya validada`.
7. Verifica que el dispositivo pertenezca al funcionario y este activo.
8. Verifica que el funcionario tenga asignado ese sector del evento en `func_sector_evento`.
9. Si todo pasa: INSERT en `validacion`, UPDATE entrada a `usada`, marca QR inactivo.
10. Retorna `OK: Acceso autorizado.`

#### `aceptar_transferencia(p_id_transfer INT)`

Con bloqueo `FOR UPDATE` en transfer y entrada:

1. Verifica que la transferencia este en estado `pendiente`.
2. Verifica que la entrada siga siendo del remitente original y este disponible.
3. Cambia `mail_propietario` al destinatario y decrementa `transferencias_rest`.
4. Invalida todos los QR activos de la entrada (ya no son del propietario anterior).
5. Marca la transferencia como `aceptada` y cancela cualquier otra transferencia pendiente para la misma entrada.

### Vistas

| Vista | Proposito |
| --- | --- |
| `v_entradas_por_propietario` | JOIN completo de entrada con evento, estadio, sector y equipos. Usada en `/entradas/mis-entradas` |
| `v_eventos_mas_vendidos` | COUNT de entradas por evento, ordenado descendente. Usada en stats de admin |
| `v_ranking_compradores` | Entradas compradas y monto total por usuario. Usada en stats de admin |

---

## Backend — API REST

### Como funciona la autenticacion

El login (`POST /auth/login`) verifica el password con BCrypt, consulta en que tablas aparece el usuario y genera un JWT firmado con HMAC-SHA256.

El JWT contiene:
- `sub` / `email`: mail del usuario
- `role`: uno o mas valores (`administrador`, `funcionario`, `usuario_general`)
- Expiracion: 120 minutos (configurable)

Cada endpoint protegido extrae el mail del claim `ClaimTypes.Email` y el rol del claim `ClaimTypes.Role`. Las politicas de autorizacion (`"Admin"`, `"Funcionario"`, `"UsuarioGeneral"`) mapean a los roles del JWT.

### Como se conecta al backend a la DB

`DbConnectionFactory` es un singleton registrado en DI. Recibe la connection string desde `appsettings.json` o la variable de entorno `ConnectionStrings__DefaultConnection`. Si la string viene en formato URI de PostgreSQL (`postgresql://user:pass@host/db`), la convierte al formato de Npgsql.

Cada endpoint crea su propia conexion con `db.CreateConnection()` y la cierra al terminar (patron using).

### Patron de los endpoints

Todos los endpoints siguen el mismo patron:

```
1. Extraer mail del JWT (CurrentMail())
2. Abrir conexion a DB
3. Abrir transaccion si hay multiples operaciones
4. Ejecutar queries con Dapper (QueryAsync / ExecuteAsync / ExecuteScalarAsync)
5. Si hay error de PostgreSQL (NpgsqlException) → 400 con el mensaje del trigger/constraint
6. Commit y respuesta 200/201
```

`EndpointHelpers.DbMessage()` extrae el mensaje legible de una `PostgresException` (que incluye el RAISE EXCEPTION de los triggers), permitiendo que los mensajes de error de la DB lleguen directos al cliente.

### Tabla de endpoints

| Metodo | Ruta | Auth | Descripcion |
| --- | --- | --- | --- |
| GET | `/health` | No | Healthcheck |
| POST | `/auth/register` | No | Registrar usuario general |
| POST | `/auth/login` | No | Login, devuelve JWT + roles |
| GET | `/auth/me` | JWT | Datos del usuario autenticado |
| GET | `/eventos` | No | Lista de eventos programados/activos |
| GET | `/eventos/{id}` | No | Detalle de evento con sectores y cupos |
| GET | `/equipos` | No | Catalogo de equipos |
| GET | `/estadios` | No | Catalogo de estadios |
| POST | `/ventas` | usuario_general | Comprar entradas (solo si verificado) |
| GET | `/ventas/mis-compras` | usuario_general | Historial de compras |
| GET | `/entradas/mis-entradas` | usuario_general | Entradas disponibles del usuario |
| GET | `/entradas/{id}/qr` | usuario_general | Generar QR dinamico (30s) |
| POST | `/transferencias` | usuario_general | Crear solicitud de transferencia |
| GET | `/transferencias/mis-transferencias` | usuario_general | Historial de transferencias |
| GET | `/transferencias/pendientes` | usuario_general | Transferencias por aceptar |
| PUT | `/transferencias/{id}/aceptar` | usuario_general | Aceptar transferencia |
| PUT | `/transferencias/{id}/rechazar` | usuario_general | Rechazar transferencia |
| POST | `/validaciones` | funcionario | Validar QR en puerta |
| GET | `/validaciones/mis-dispositivos` | funcionario | Dispositivos activos del funcionario |
| GET | `/admin/mi-pais` | administrador | Pais gestionado por el admin |
| GET | `/admin/eventos` | administrador | Eventos creados por el admin |
| POST | `/admin/eventos` | administrador | Crear nuevo evento |
| POST | `/admin/eventos/{id}/sectores` | administrador | Agregar/actualizar sector de evento |
| GET | `/admin/usuarios` | administrador | Lista de usuarios generales |
| PATCH | `/admin/usuarios/{mail}/verificar` | administrador | Verificar usuario |
| GET | `/stats/eventos-mas-vendidos` | administrador | Top 20 eventos por entradas vendidas |
| GET | `/stats/top-compradores` | administrador | Top 20 compradores |

---

## Frontend — Next.js 14

### Como se gestiona la sesion

No hay cookies ni server-side state. La sesion se guarda en `localStorage` con tres claves:

```
jwt_token   → string del JWT
user_mail   → mail del usuario
user_roles  → JSON array de roles ["usuario_general"]
```

`getSession()` lee estas claves y devuelve un objeto `Session | null`. `saveSession()` las escribe tras el login. `clearSession()` las borra al hacer logout. Cada pagina protegida llama `hasRole(getSession(), "rol_requerido")` al montarse y redirige a `/auth/login` si falla.

El `Navbar` escucha el evento DOM `"session-change"` (lanzado por `saveSession` y `clearSession`) para actualizar los links visibles segun el rol sin recargar la pagina.

### Como se hacen las llamadas a la API

`apiFetch<T>(path, options)` en `lib/api.ts` es el unico punto de acceso a la API:

1. Lee el token de `localStorage` y lo agrega como `Authorization: Bearer ...`
2. Llama a `fetch(API_BASE_URL + path, ...)`
3. Si la respuesta no es OK, extrae el campo `error` del JSON o usa el status HTTP
4. Si es 204 (No Content), devuelve `undefined`
5. Si es exitosa, parsea el JSON y lo devuelve tipado

`API_BASE_URL` viene de la variable de entorno `NEXT_PUBLIC_API_BASE_URL` (definida en `.env.local`).

### Componente QrDisplay

El componente mas complejo del frontend. Maneja dos intervalos independientes:

- **Intervalo de fetch** (29 segundos): llama a `GET /entradas/{id}/qr`, que en el backend invoca `generar_qr_token()`, invalida el anterior y crea uno nuevo. La respuesta incluye la imagen en base64.
- **Intervalo de cuenta regresiva** (1 segundo): decrementa un contador de 29 a 0 para mostrarle al usuario cuanto falta para la renovacion.

```
Componente montado
    │
    ├── fetchQr() inmediatamente → muestra QR
    │       ↓
    │   cada 29s → fetchQr() nuevamente
    │
    └── cada 1s → decrementa contador visual
```

### Paginas y su relacion con los endpoints

| Pagina | Ruta | Endpoints que consume |
| --- | --- | --- |
| Home | `/` | `GET /eventos` |
| Detalle evento | `/evento/[id]` | `GET /eventos/{id}`, `POST /ventas` |
| Mis entradas | `/mis-entradas` | `GET /entradas/mis-entradas`, `GET /entradas/{id}/qr`, `POST /transferencias` |
| Mis compras | `/mis-compras` | `GET /ventas/mis-compras` |
| Transferencias | `/transferencias` | `GET /transferencias/mis-transferencias`, `GET /transferencias/pendientes`, `PUT /transferencias/{id}/aceptar`, `PUT /transferencias/{id}/rechazar` |
| Validar | `/validar` | `GET /validaciones/mis-dispositivos`, `POST /validaciones` |
| Admin dashboard | `/admin` | `GET /stats/eventos-mas-vendidos`, `GET /stats/top-compradores`, `GET /admin/usuarios`, `PATCH /admin/usuarios/{mail}/verificar` |
| Admin eventos | `/admin/eventos` | `GET /admin/eventos`, `POST /admin/eventos`, `POST /admin/eventos/{id}/sectores`, `GET /estadios`, `GET /equipos` |
| Login | `/auth/login` | `POST /auth/login` |
| Registro | `/auth/register` | `POST /auth/register` |

---

## Flujos de datos completos

### Flujo 1: Compra de entradas

```
[Usuario] click Comprar (cantidad=1, sector=A)
    │
    ↓  POST /ventas  { idEvento, items: [{idSector, idEstadio, cantidad}] }
    │
[Backend VentaEndpoints.CrearVenta]
    ├── 1. Verificar que usuario_general.estado_verif = 'verificado'
    ├── 2. Verificar que evento.estado IN ('programado', 'activo')
    ├── 3. Obtener comision vigente (comision_historico WHERE fecha_fin IS NULL)
    ├── 4. Para cada item: verificar disponibles y calcular subtotal
    ├── 5. INSERT INTO venta (estado='pagada', monto_total con comision)
    └── 6. Para cada cantidad: INSERT INTO entrada
                │
                ↓  TRIGGER trg_controlar_insert_entrada
                ├── ¿usuario tiene < 5 entradas para el evento? → sino RAISE EXCEPTION
                └── UPDATE evento_sector SET entradas_emitidas += 1
                    WHERE entradas_emitidas < cupo_maximo → sino RAISE EXCEPTION
    │
    ↓  201 Created { idVenta, montoTotal }
    │
[Frontend] redirige a /mis-entradas
```

### Flujo 2: Generacion y validacion de QR

```
[Usuario] click Ver QR
    │
    ↓  GET /entradas/{id}/qr
    │
[Backend EntradaEndpoints.GenerarQr]
    ├── Verificar que el propietario sea el usuario autenticado
    └── SELECT * FROM generar_qr_token(@id)
            ├── Verificar que entrada.estado = 'disponible'
            ├── UPDATE qr_token SET activo=FALSE WHERE id_entrada = @id AND activo=TRUE
            ├── v_hash = encode(gen_random_bytes(32), 'hex')
            └── INSERT INTO qr_token (codigo_hash=v_hash, fecha_expiracion=now()+30s, activo=TRUE)
    └── Genera imagen PNG con QRCoder y codifica en base64
    │
    ↓  200 { codigoHash, qrBase64, fechaExpiracion }
    │
[Frontend QrDisplay] muestra imagen, inicia countdown de 29s, repite cada 29s

──────────── el usuario muestra el QR al funcionario ────────────

[Funcionario] pega hash en /validar y click Validar
    │
    ↓  POST /validaciones  { codigoHash, idDispositivo }
    │
[Backend ValidacionEndpoints.Validar]
    └── SELECT validar_entrada(@hash, @mail_func, @disp)
            ├── ¿qr_token existe? → sino ERROR
            ├── ¿activo=TRUE? → sino ERROR
            ├── ¿fecha_expiracion >= now()? → sino marca inactivo y ERROR
            ├── SELECT entrada FOR UPDATE (bloqueo optimista)
            ├── ¿entrada.estado = 'disponible'? → sino ERROR
            ├── ¿no existe ya una validacion para esta entrada? → sino ERROR
            ├── ¿dispositivo.mail_funcionario = @mail_func AND activo=TRUE? → sino ERROR
            ├── ¿func_sector_evento tiene al funcionario para ese evento/sector? → sino ERROR
            ├── INSERT INTO validacion
            ├── UPDATE entrada SET estado='usada'
            └── UPDATE qr_token SET activo=FALSE
    │
    ↓  200 { ok: true, mensaje: "OK: Acceso autorizado." }
```

### Flujo 3: Transferencia de entrada

```
[Remitente] ingresa mail de destinatario y click Enviar transferencia
    │
    ↓  POST /transferencias  { idEntrada, mailDestinatario }
    │
[Backend TransferEndpoints.Crear]
    ├── Verificar que remitente != destinatario
    ├── Verificar que el propietario actual sea el remitente
    ├── Verificar que entrada.estado = 'disponible' y transferencias_rest > 0
    ├── Verificar que el destinatario exista en usuario_general
    └── INSERT INTO transfer (estado='pendiente')
            │
            ↓  TRIGGER trg_validar_insert_transferencia
            └── (doble check de propietario, estado y transferencias_rest)
    │
    ↓  201 Created { idTransfer }

──────────── el destinatario acepta ────────────

[Destinatario] click Aceptar en /transferencias → Pendientes
    │
    ↓  PUT /transferencias/{id}/aceptar
    │
[Backend TransferEndpoints.Aceptar]
    └── SELECT aceptar_transferencia(@id)
            ├── SELECT transfer FOR UPDATE
            ├── ¿transfer.estado = 'pendiente'? → sino RAISE EXCEPTION
            ├── SELECT entrada FOR UPDATE
            ├── ¿entrada sigue siendo del remitente y disponible? → sino RAISE EXCEPTION
            ├── UPDATE entrada SET mail_propietario = destinatario, transferencias_rest -= 1
            ├── UPDATE qr_token SET activo=FALSE (invalida QR del remitente)
            ├── UPDATE transfer SET estado='aceptada'
            └── UPDATE transfer SET estado='cancelada' (otras pendientes para la misma entrada)
    │
    ↓  200 { ok: true }
```

### Flujo 4: Registro y verificacion de usuario

```
[Nuevo usuario] completa formulario en /auth/register
    │
    ↓  POST /auth/register  { mail, password, doc*, dir*, telefonos }
    │
[Backend AuthEndpoints.Register]
    ├── INSERT INTO usuario (password_hash = BCrypt.HashPassword(password))
    ├── INSERT INTO usuario_general (estado_verif = 'pendiente')
    └── INSERT INTO usuario_telefono (por cada telefono)
    │
    ↓  201 Created

──────────── el admin verifica ────────────

[Admin] click Verificar en /admin
    │
    ↓  PATCH /admin/usuarios/{mail}/verificar
    │
[Backend AdminEndpoints.VerificarUsuario]
    └── UPDATE usuario_general SET estado_verif='verificado' WHERE mail=@mail
    │
    ↓  200 { ok: true }

──────────── ahora el usuario puede comprar ────────────

[Endpoint POST /ventas]
    └── SELECT estado_verif FROM usuario_general WHERE mail = @mail
        ↓ si != 'verificado' → 403 Forbidden
```

---

## Seguridad

| Mecanismo | Donde se aplica | Como |
| --- | --- | --- |
| Hashing de passwords | Backend AuthEndpoints | BCrypt con salt autogenerado |
| Autenticacion | Todos los endpoints protegidos | JWT Bearer validado por ASP.NET Core |
| Autorizacion por rol | Cada endpoint | `.RequireAuthorization("Admin" / "Funcionario" / "UsuarioGeneral")` |
| Autorizacion por dato | Dentro de cada handler | Compara `mail del JWT` con `mail_propietario` de la DB |
| Bloqueo de concurrencia | Funciones PL/pgSQL | `SELECT ... FOR UPDATE` antes de modificar entradas y transfers |
| Integridad de cupo | Trigger `trg_controlar_insert_entrada` | Atomico a nivel DB, no puede ser bypasseado por el backend |
| QR de un solo uso | Funcion `validar_entrada` | UNIQUE constraint en `validacion(id_entrada)` |
| QR con expiracion | Funcion `generar_qr_token` | `fecha_expiracion = now() + 30s`, verificado en `validar_entrada` |
| Limite de transferencias | Columna `transferencias_rest` | Decrementada en `aceptar_transferencia`, CHECK >= 0 |

---

## Como correr el proyecto

### Variables de entorno necesarias

```bash
# Backend (zsh/bash)
export ConnectionStrings__DefaultConnection="postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require&channel_binding=require"

# Frontend — archivo worldcup-frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

### Levantar

```bash
# Terminal 1 — backend (puerto 5000)
cd WorldCupTicketing.Api
dotnet run

# Terminal 2 — frontend (puerto 3001)
cd worldcup-frontend
npm run dev -- -p 3001
```

### Smoke tests

```bash
pwsh ./tests/smoke.ps1 -FrontendBaseUrl http://localhost:3001
```

El script verifica de punta a punta: health, frontend, login por roles, bloqueo de solapamiento, registro, verificacion, compra, transferencia, QR dinamico, validacion y bloqueo de revalidacion.
