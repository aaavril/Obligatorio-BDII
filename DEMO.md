# Guion de Demo — Sistema de Ticketing Mundial 2026

Objetivo: mostrar, para cada tipo de usuario, la funcionalidad desde el frontend y luego verificar en Neon (tabla por tabla) que el dato quedó persistido correctamente, conectando cada paso con el requisito puntual de la letra del obligatorio. Cada bloque tiene: **qué mostrar → en qué pantalla/código → en qué tabla de Neon se refleja → qué requisito de la letra cubre**.

Tener dos pestañas abiertas todo el tiempo: el **frontend** (worldcup-frontend) y la **consola SQL de Neon**. Sugerido: una query guardada por bloque para no escribir SQL en vivo.

---

## 0. Introducción técnica (2-3 min)

Arrancar con el panorama completo antes de tocar la app, para que quien evalúe entienda qué está mirando.

### 0.1 El problema en una frase

Sistema de ticketing para los partidos del Mundial 2026 con **Entrada Dinámica**: el boleto no es una imagen fija sino un token que muta cada 30 segundos, con una cadena de custodia completa (quién la compró, a quién se transfirió, quién la validó) registrada de forma inmutable en la base de datos.

### 0.2 Arquitectura cliente/servidor (3 capas)

```
Cliente (navegador)                Servidor de aplicación             Base de datos
┌─────────────────────┐    HTTPS   ┌──────────────────────┐  TCP/IP   ┌─────────────────────┐
│ React 18 + Next.js 14│  REST/JSON │ ASP.NET Core 8        │  SSL     │ PostgreSQL 15+        │
│ TypeScript            │ ────────▶ │ Minimal API            │ ───────▶ │ alojado en Neon        │
│ (SPA en el navegador) │  JWT      │ + Dapper (SQL directo) │  :5432   │ (infraestructura Linux)│
└─────────────────────┘            └──────────────────────┘            └─────────────────────┘
```

- **Frontend**: React 18 + Next.js 14 + TypeScript. Vive en `worldcup-frontend/`. Nunca toca la base de datos directamente — solo consume la API REST. Carpetas clave: `app/` (rutas por página), `components/` (ej. `QrDisplay.tsx`), `lib/api.ts` (cliente HTTP + manejo de sesión/JWT).
- **Backend**: ASP.NET Core 8 Minimal API en C#, en `WorldCupTicketing.Api/`. Organizado en `Endpoints/` (un archivo por dominio: `AuthEndpoints`, `VentaEndpoints`, `EntradaEndpoints`, `TransferEndpoints`, `ValidacionEndpoints`, `AdminEndpoints`, `EventoEndpoints`, `StatsEndpoints`), `Data/DbConnectionFactory.cs` (conexión Npgsql), `Services/` (JWT).
- **Acceso a datos**: Dapper, un micro-ORM — el backend escribe SQL/llama funciones SQL directamente, sin capa de abstracción tipo Entity Framework. Esto es deliberado: la lógica de negocio crítica vive en la base, no en C#.
- **Base de datos**: PostgreSQL 15+ alojado en Neon (PostgreSQL administrado, infraestructura Linux). Justificación de por qué Neon y no una VM propia: portabilidad total (cualquier compañero o profesor se conecta con el connection string desde cualquier máquina), cero mantenimiento de sistema operativo, y sigue siendo 100% PostgreSQL estándar — nada de lo implementado (triggers, funciones PL/pgSQL) depende de Neon específicamente.
- **Auth**: JWT Bearer (RFC 7519), stateless, con claims de rol (`administrador`, `funcionario`, `usuario_general`). El backend valida el rol en cada endpoint con `RequireAuthorization("...")`.
- **Por qué este stack y no otro**: se evaluaron MySQL+Java (descartada: peor soporte de triggers/stored procedures, sin `gen_random_bytes` nativo) y MongoDB+Node (descartada de plano: la letra exige SQL, y Mongo no tiene triggers). PostgreSQL fue elegido por: `pgcrypto` nativo para los hashes del QR, PL/pgSQL para encapsular reglas de negocio complejas, y MVCC para concurrencia segura en compras simultáneas.

### 0.3 Por qué la lógica de negocio vive en la base, no en C#

Decisión de arquitectura central del proyecto: reglas como "máximo 5 entradas por venta" o "no superar el cupo del sector" están implementadas como **triggers y funciones PL/pgSQL** en PostgreSQL, no como `if` en el backend. Esto garantiza que la regla se cumple sin importar qué cliente escriba en la base — la API, una herramienta administrativa, o alguien conectado directo con `psql`. El backend es, en gran medida, un traductor entre HTTP/JSON y llamadas a funciones SQL.

### 0.4 Modelo de datos (resumen)

19 tablas en 5 módulos:

| Módulo | Tablas |
|---|---|
| Usuarios y roles | `usuario` (superentidad), `usuario_telefono`, `administrador`, `admin_pais`, `funcionario`, `usuario_general` |
| Infraestructura y eventos | `pais_sede`, `estadio`, `sector`, `equipo`, `evento`, `evento_sector` |
| Comisiones y ventas | `comision_historico`, `venta` |
| Entradas y transferencias | `entrada`, `transfer` |
| Seguridad y validación | `qr_token`, `dispositivo`, `validacion`, `func_sector_evento` |

Patrón de herencia: `usuario` es la superentidad (PK `mail`); `administrador`, `funcionario` y `usuario_general` son subtablas con `mail` como PK y FK hacia `usuario`. Estrategia **table-per-subclass**: permite que un mismo mail sea simultáneamente funcionario y usuario_general (herencia solapada), sin columnas NULL masivas.

---

## 1. Roles y privilegios (3-4 min)

### Qué mostrar
Loguear con cada uno de los 3 roles y mostrar que el menú/las rutas disponibles cambian.

Credenciales seed (`sql/02_seed_data.sql`):

| Rol | Mail | Password | Dato propio del rol |
|---|---|---|---|
| Administrador (USA) | admin.usa@mundial2026.com | Admin123! | fecha_asignacion, país gestionado |
| Funcionario de validación | func001@mundial2026.com | Func123! | nro_legajo = LEG-001, dispositivo "Tablet puerta A" |
| Usuario general | usuario.test@test.com | Test123! | fecha_registro, estado_verif |

1. **Usuario general** → `/auth/login` → acceso a comprar (`/evento/[id]`), `/mis-compras`, `/mis-entradas`, `/transferencias`. Sin acceso a `/admin/eventos` ni `/validar`.
2. **Administrador** → `/admin/eventos`: alta de eventos, solo sobre estadios de su país.
3. **Funcionario** → `/validar`: selector de dispositivo autorizado + campo para el hash del QR.

### Cómo está hecho (código)
- El JWT incluye un claim de rol al loguear (`AuthEndpoints.cs` → `POST /auth/login`).
- El frontend usa `hasRole(getSession(), "rol")` (`lib/api.ts`) para decidir si redirige o muestra la pantalla.
- El backend protege cada endpoint con `.RequireAuthorization("UsuarioGeneral" | "Administrador" | "Funcionario")` — la verdadera barrera de seguridad está acá, no en el frontend (el guard del frontend es solo UX).

### Dónde se ve en la base de datos
El rol **no es un campo plano**: es la presencia de una fila en una subtabla. Verificar:
```sql
select mail, doc_pais, doc_tipo, doc_nro from usuario;
select * from administrador;          -- fecha_asignacion, id_pais_gestionado
select * from admin_pais;             -- países gestionados (relación auxiliar histórica)
select * from funcionario;            -- nro_legajo
select * from usuario_general;        -- fecha_registro, estado_verif
select * from dispositivo;            -- dispositivo vinculado al funcionario
```
Mostrar en vivo: si un mail aparece en `administrador` Y en `usuario_general` a la vez, ese usuario tiene los dos roles simultáneamente (herencia solapada, IS-A parcial-solapada del MER, sección 6.1 del informe).

### Requisito de la letra cubierto
"Control de acceso basado en roles" con Administrador por País Sede (fecha de asignación), Funcionario de Validación (número de legajo), Usuario General (fecha de registro + estado de verificación).

---

## 2. Registro de usuario (2 min)

### Qué mostrar
`/auth/register`: completar mail, documento (país + tipo + número), dirección completa, y agregar **2 teléfonos**. Enviar y loguear.

### Cómo está hecho (código)
`AuthEndpoints.cs` → `POST /auth/register`: hashea el password (`crypt`/`gen_salt` vía pgcrypto, mismo mecanismo que usa el seed), inserta en `usuario`, inserta cada teléfono en `usuario_telefono`, y crea la fila en `usuario_general` con `fecha_registro = now()` y `estado_verif = 'pendiente'`.

### Dónde se ve en la base de datos
```sql
select * from usuario where mail = '<el mail usado>';
select * from usuario_telefono where mail = '<el mail usado>';   -- debe haber 2 filas
select * from usuario_general where mail = '<el mail usado>';
```
Mensaje clave: `usuario_telefono` tiene **PK compuesta** `(mail, telefono)` — es la forma correcta de modelar un atributo multivaluado en 1FN (nada de listas ni de columnas `telefono1, telefono2`). El documento es único por `UNIQUE(doc_pais, doc_tipo, doc_nro)` en `usuario`.

### Requisito de la letra cubierto
"Registro proporcionando datos personales, incluyendo mail, documento (País + Tipo + Número, único), dirección, y múltiples teléfonos de contacto."

---

## 3. Compra de entradas — comisión 5% y límite de 5 entradas (5-6 min)

Bloque más importante de reglas de negocio.

### Preparación previa (opcional, fuera de cámara)
La tabla `comision_historico` ya viene seedeada al **5%** (`sql/02_seed_data.sql`), igual que pide la letra — no hace falta ningún ajuste para que la demo arranque correcta. Si además querés demostrar en vivo que la tasa es histórica/variable (no una constante hardcodeada), preparar de antemano un cambio a un porcentaje distinto, para mostrar el "antes/después" sin escribir SQL en cámara:
```sql
update comision_historico set fecha_fin = now() where id_comision = 1;
insert into comision_historico (porcentaje, fecha_inicio, fecha_fin) values (7.00, now(), null);
```

### Qué mostrar (en vivo)
1. Loguear como `usuario.test@test.com`, ir a `/evento/1`, elegir sector y cantidad.
2. **Límite de 5 entradas por transacción**: intentar pedir 6 → debe rechazar. El frontend ahora muestra el error real devuelto por el trigger en rojo debajo del botón Comprar.
3. **Comisión visible antes de comprar**: el panel "Resumen" del frontend ya muestra `Subtotal`, `Comisión (5%)` y `Total a pagar` — pedile a la API `/comision/vigente` ese porcentaje, no hay que adivinarlo ni ir a Neon para saber cuánto se va a cobrar.
4. Comprar 2-3 entradas válidas (dentro del límite) y confirmar. El frontend ahora muestra un bloque de **confirmación real** con el número de venta, cantidad de entradas y el monto efectivamente cobrado (ya no redirige a ciegas).

### Dónde se ve en la base de datos (preferir Table View, sin escribir SQL)
1. Abrir **Tables → `comision_historico`** en Neon: se ve la fila vigente al 5% (`fecha_fin = NULL`). Si se preparó el cambio opcional de arriba, se ven dos filas — la del 5% ya cerrada (`fecha_fin` seteada) y la nueva vigente. Esto demuestra que la tasa es histórica, no una constante en el código.
2. Abrir **Tables → `venta`**, ordenar por `fecha` descendente: la fila más nueva tiene `comision_pct = 5.00` (o el valor que estuviera vigente al momento de esa compra) — el valor quedó "congelado" en esa venta aunque después la tasa vuelva a cambiar.
3. Click en el `id_venta` de esa fila (es una columna clickeable, FK) → salta directo a las filas de `entrada` con ese `id_venta`: cada una con su propio `id_entrada` y `mail_propietario` = el comprador.
4. Desde una de esas filas de `entrada`, click en `id_evento`/`id_sector`/`id_estadio` → salta a `evento_sector` y se ve `entradas_emitidas` ya incrementado.

Si en algún momento Table View no alcanza (por ejemplo, para confirmar el cálculo exacto), tener como respaldo en el SQL Editor:
```sql
select * from comision_historico order by fecha_inicio;
select * from venta order by fecha desc limit 5;
select * from entrada where id_venta = <id de la venta>;
select * from evento_sector where id_evento = 1;
```

### Cómo está hecho (código)
- `VentaEndpoints.cs` → `POST /ventas`: recibe la lista de ítems (sector + cantidad), busca la comisión vigente (`SELECT porcentaje FROM comision_historico WHERE fecha_fin IS NULL ORDER BY fecha_inicio DESC LIMIT 1`), calcula `monto_total = SUM(precio_sector * cantidad) * (1 + comision_pct/100)`, inserta la fila en `venta` con ese `comision_pct` ya congelado, y por cada entrada hace un `INSERT INTO entrada(...)`.
- Ese mismo porcentaje se expone también en `GET /comision/vigente` (`EventoEndpoints.cs`), endpoint público que usa el frontend para mostrar el desglose antes de comprar — sin este endpoint, el usuario no tenía forma de saber el total real hasta después de pagar.
- La validación dura no está en C#: cada `INSERT INTO entrada` dispara el trigger `controlar_insert_entrada()` (`sql/02_triggers_functions.sql`), que en una sola pasada:
  - cuenta cuántas entradas ya tiene **esa venta** (`SELECT COUNT(*) FROM entrada WHERE id_venta = NEW.id_venta`) y rechaza con `'No se pueden comprar mas de 5 entradas en la misma transaccion.'` si llega a 5. (Corregido: antes contaba el historial completo del usuario para ese evento, lo cual no coincidía con la letra — ver nota más abajo.)
  - actualiza `evento_sector.entradas_emitidas` solo si todavía hay cupo (`entradas_emitidas < cupo_maximo`); si no, rechaza con `'No hay cupo disponible para el sector seleccionado.'`
  - si todo pasa, queda incrementado en la misma transacción.

> Nota de corrección aplicada en esta sesión: el trigger original contaba `mail_propietario + id_evento` acumulado en el tiempo (un tope de por vida por usuario y evento), lo cual no es lo que pide la letra ("no podré comprar más de 5 entradas **en la misma transacción**"). Se corrigió para que cuente por `id_venta` — la transacción actual — permitiendo comprar hasta 5 en cada venta nueva, sin importar cuántas se compraron antes para ese mismo evento.

Mensaje clave: `venta.comision_pct` es una **desnormalización intencional** (documentada en la sección 6.5/9 del informe): copia el porcentaje vigente al momento de la venta para que, si la tasa global cambia después, las ventas históricas no se recalculen retroactivamente. Una venta puede contener N entradas, pero cada `entrada` tiene su propio `id_entrada` — identidad individual del boleto, exigida por la letra.

### Requisito de la letra cubierto
"Costo de cada entrada varía por sector. Monto total = costo + comisión del 5% (tasa puede variar en el tiempo). Un usuario no puede comprar más de 5 entradas en la misma transacción. Cada boleto individual tiene su propio identificador, inicialmente bajo titularidad del comprador."

---

## 4. Cupo máximo por sector — sin sobreaforo (2-3 min)

### Preparación previa (fuera de cámara, antes de arrancar la demo)
Bajar el cupo de un sector para que se agote rápido en vivo, sin tener que comprar decenas de entradas en cámara:
```sql
update evento_sector set cupo_maximo = 2 where id_evento = 1 and id_sector = <X>;
```

### Qué mostrar (en vivo)
Comprar desde el frontend hasta agotar ese cupo (2 entradas), y luego intentar una compra adicional sobre ese mismo sector → debe rechazar con el mensaje del trigger.

### Cómo está hecho (código)
Mismo trigger `check_entrada_antes_insertar()` del bloque 3 — el control de aforo y el límite de 5 entradas están **unificados en un único trigger `BEFORE INSERT`** sobre `entrada` (decisión documentada en sección 7.4/9 del informe: evita ambigüedad de orden si fueran dos triggers separados, y evita insertar una fila que después haya que revertir).

### Dónde se ve en la base de datos
```sql
select cupo_maximo, entradas_emitidas from evento_sector where id_evento = 1 and id_sector = <X>;
```
`evento_sector` tiene un `CHECK (entradas_emitidas <= cupo_maximo)` además del trigger — doble capa de protección (constraint declarativa + lógica procedural).

### Requisito de la letra cubierto
"Cada sector tendrá una capacidad máxima parametrizable, actuando como un límite duro para la emisión de entradas y evitando el sobre aforo."

---

## 5. Transferencia de entradas — máximo 3 veces (4-5 min)

### Qué mostrar
1. Como `usuario.test@test.com`, en `/mis-entradas`, elegir una entrada, iniciar transferencia hacia otro usuario.
2. Loguear como destinatario, en `/transferencias`, **aceptar**.
3. Repetir el ciclo 3 veces sobre la misma entrada.
4. En el 4to intento, mostrar el rechazo.

### Cómo está hecho (código)
- `TransferEndpoints.cs` → `POST /transferencias`: llama a una función/trigger que valida que quien inicia la transferencia sea el `mail_propietario` actual y que `entrada.transferencias_rest > 0`.
- `PUT /transferencias/{id}/aceptar`: llama a `aceptar_transferencia(id_transfer)` (PL/pgSQL, `sql/02_triggers_functions.sql`), que dentro de una transacción: bloquea la fila de `transfer` y de `entrada` con `FOR UPDATE`, valida estado `pendiente`, actualiza `entrada.mail_propietario` al destinatario, **decrementa `transferencias_rest`**, y marca la transferencia como `aceptada`.
- Un índice único parcial `ux_transfer_pendiente_entrada` impide tener dos transferencias pendientes simultáneas sobre la misma entrada.

### Dónde se ve en la base de datos
```sql
select * from transfer where id_entrada = <id> order by fecha_solicitud;
select id_entrada, mail_propietario, transferencias_rest, estado from entrada where id_entrada = <id>;
```
Mensaje clave: `transfer` es un **historial inmutable** (nunca se hace `UPDATE` sobre una fila vieja para "reusarla", cada transferencia es una fila nueva) — esto es lo que permite reconstruir la cadena de custodia completa: emisión → cada cambio de mano → validación final. `entrada.mail_propietario` es la otra desnormalización intencional documentada: evita tener que recorrer/recursar sobre `transfer` cada vez que se pregunta "¿quién tiene esta entrada ahora?" (la consulta más frecuente del sistema), sincronizada por el mismo trigger en cada aceptación.

### Requisito de la letra cubierto
"El sistema permitirá que un usuario transfiera una entrada a otro de forma directa. Una vez el destinatario acepte, la entrada cambia de propietario. Log histórico de cada transferencia. Máximo 3 transferencias antes de su validación."

---

## 6. QR dinámico — rotación cada 30s (2-3 min)

### Qué mostrar
En `/mis-entradas`, abrir "Ver QR" sobre una entrada propia. Dejarlo en cámara: el contador "Renueva en Xs" bajando desde 29 y el QR cambiando automáticamente al llegar a 0.

### Cómo está hecho (código)
- Frontend (`components/QrDisplay.tsx`): `useEffect` + `setInterval(fetchQr, 29000)` — pide un QR nuevo un segundo antes de que el anterior expire, para no dejar un hueco sin QR válido. Un segundo `setInterval` lleva el contador visual 29→0 (puramente estético).
- Backend (`EntradaEndpoints.cs` → `GET /entradas/{id}/qr`): verifica que el usuario logueado sea el `mail_propietario` actual, llama a la función SQL `generar_qr_token(idEntrada)`, y con el hash que devuelve genera la imagen PNG (librería `QRCoder`) codificada en base64.
- Función SQL `generar_qr_token()` (`sql/02_triggers_functions.sql`): valida que la entrada esté `disponible`, **desactiva** (`activo = FALSE`) cualquier token previo todavía activo de esa entrada, genera un hash aleatorio criptográfico con `gen_random_bytes(32)` (pgcrypto), e inserta una **fila nueva** en `qr_token` con `fecha_expiracion = now() + 30s`.

### Dónde se ve en la base de datos
```sql
select id_token, codigo_hash, fecha_generacion, fecha_expiracion, activo
from qr_token where id_entrada = <id> order by fecha_generacion desc limit 5;
```
Mensaje clave: cada llamada **inserta una fila nueva**, nunca pisa la anterior. `qr_token` termina siendo el historial completo de todos los códigos que tuvo esa entrada — la auditoría que exige la letra. El índice `ix_qr_token_activo` es un **índice parcial** (`WHERE activo = TRUE`) — optimización mencionada en la sección 2.8 del informe: la inmensa mayoría de los tokens están inactivos, y la consulta crítica de validación siempre busca tokens activos.

### Requisito de la letra cubierto
"Mientras la app esté en primer plano, el QR se regenerará cada 30 segundos. Garantiza que solo quien posee la app activa puede ingresar (previene fraude por captura de pantalla)."

---

## 7. Validación en puerta por el funcionario (4 min)

### Qué mostrar
1. Copiar el `codigo_hash` del QR activo del bloque anterior.
2. Loguear como `func001@mundial2026.com`, ir a `/validar`, elegir el dispositivo autorizado, pegar el hash, validar → "ok".
3. Repetir la validación con el **mismo hash** una segunda vez → debe rechazar ("entrada ya validada" o "QR inactivo").
4. (Opcional) Probar con un dispositivo no vinculado a ese funcionario → debe rechazar.

### Cómo está hecho (código)
- `ValidacionEndpoints.cs` → `POST /validaciones`: recibe `{ codigoHash, idDispositivo }`, toma el mail del funcionario logueado desde el JWT, y llama a `validar_entrada(hash, mail_func, id_dispositivo)`.
- Función SQL `validar_entrada()` (`sql/02_triggers_functions.sql`) corre, en una sola transacción, esta cadena de checks en orden — cualquiera que falle aborta todo:
  1. ¿Existe el hash en `qr_token`? ¿Está `activo = TRUE`? ¿No venció `fecha_expiracion`?
  2. Bloquea la fila de `entrada` (`FOR UPDATE`) y verifica que siga `disponible`.
  3. ¿Ya existe una `validacion` previa para esa entrada? (anti-reingreso).
  4. ¿El dispositivo está `activo = TRUE` y vinculado a ese `mail_funcionario` en `dispositivo`?
  5. ¿El funcionario tiene permiso sobre ese sector/evento en `func_sector_evento`?
  6. Si todo pasa: `INSERT INTO validacion(...)`, `UPDATE entrada SET estado = 'usada'` (irreversible), `UPDATE qr_token SET activo = FALSE`.

### Dónde se ve en la base de datos
```sql
select * from validacion order by id_validacion desc limit 5;   -- qué hash, qué funcionario, qué dispositivo, cuándo
select estado from entrada where id_entrada = <id>;               -- 'usada', irreversible
```
`validacion` tiene `UNIQUE(id_entrada)` — a nivel de constraint, es imposible que una misma entrada se valide dos veces, aunque hubiera un bug en la función. Doble capa de defensa otra vez.

### Requisito de la letra cubierto
"No cualquier dispositivo podrá validar (registro de dispositivos autorizados, vinculados a un funcionario). Al escanear, el sistema verifica la validez del QR activo y registra el código aceptado y la identidad del funcionario, marcando la entrada como consumida de forma irreversible."

Nota: el requisito de que "un funcionario debe haber validado entradas en todos los sectores a los que fue asignado" se verifica cruzando `validacion` (vía `entrada.id_sector`) contra `func_sector_evento` — está documentado como vista analítica de extensión en la sección 9 del informe; si no hay pantalla para esto, mencionarlo verbalmente y mostrar la query directamente en Neon.

---

## 8. Estadísticas — vistas SQL (2-3 min)

Bloque ideal para mostrar las **views** de PostgreSQL bien, con Table View de Neon.

### Qué mostrar (en vivo)
1. Loguear como `admin.usa@mundial2026.com` y entrar a **`/admin`** (el dashboard, no `/admin/eventos`). Ahí se ven dos paneles ya renderizados: "Eventos más vendidos" y "Top compradores", con datos reales (`AdminPage` → `StatsEndpoints.cs` → `GET /stats/eventos-mas-vendidos` y `GET /stats/top-compradores`).
2. Pasar a Neon y abrir **Tables**: las views aparecen en una sección separada de las tablas comunes (suelen listarse bajo "Views" o con un ícono distinto, porque no son datos guardados — son una consulta guardada que se ejecuta cada vez que se abren). Abrir `v_eventos_mas_vendidos` y `v_ranking_compradores` ahí.
3. Comparar fila por fila: el número que muestra el panel del admin tiene que ser exactamente el mismo que la fila de la view en Neon — porque es literalmente la misma fuente, sin transformación intermedia en el backend (`StatsEndpoints.cs` hace `SELECT * FROM v_eventos_mas_vendidos LIMIT 20` sin tocar nada más).
4. Mencionar la tercera vista del sistema, `v_entradas_por_propietario` — no es para estadísticas, es la que usa `GET /entradas/mis-entradas` para armar la pantalla de "Mis Entradas" de cualquier usuario general (hace los `JOIN` contra `evento`, `estadio`, `sector` y equipos para no repetir esa lógica en cada endpoint). Abrirla en Neon también para mostrar que las views no son solo para reportes — se usan como capa de lectura reutilizable en toda la app.

### Por qué son views y no tablas
Una view es una consulta con nombre, no datos guardados: cada vez que se lee, PostgreSQL ejecuta el `SELECT` de su definición contra las tablas reales (`evento`, `entrada`, `venta`, etc.) en ese momento. Por eso, si comprás una entrada nueva en el bloque 3 y volvés a `v_eventos_mas_vendidos`, el número sube solo — no hay que "actualizar" nada a mano, ni hay desincronización posible entre la vista y los datos reales.

### Dónde se ve la definición de cada view (si preguntan cómo están armadas)
```sql
select pg_get_viewdef('v_eventos_mas_vendidos', true);
select pg_get_viewdef('v_ranking_compradores', true);
select pg_get_viewdef('v_entradas_por_propietario', true);
```
`v_eventos_mas_vendidos` hace `LEFT JOIN` de `evento` contra `entrada` y `sector`, agrupando por evento para sumar `entradas_vendidas` y el bruto en dinero. `v_ranking_compradores` usa dos CTEs (`entradas_por_usuario` y `montos_por_usuario`) sobre `venta`/`entrada` filtrando solo ventas `pagada`, y hace `LEFT JOIN` contra `usuario_general` para que aparezcan también los usuarios con 0 compras.

### Requisito de la letra cubierto
"Visualizar los eventos en los que se vendieron más entradas y el ranking de los mayores compradores."

---

## 9. Cierre (1-2 min)

Resumen de qué reglas de negocio viven en triggers/funciones de PostgreSQL (no en C#/TypeScript), para remarcar que la integridad se garantiza aún si alguien escribe directo a la base:

| Regla | Dónde vive |
|---|---|
| Máximo 5 entradas por venta | trigger `check_entrada_antes_insertar()` sobre `entrada` |
| Cupo máximo por sector (sin sobreaforo) | mismo trigger + `CHECK` en `evento_sector` |
| Máximo 3 transferencias por entrada | función `aceptar_transferencia()` + contador `transferencias_rest` |
| Comisión histórica/variable | tabla `comision_historico` + snapshot en `venta.comision_pct` |
| QR que rota cada 30s y se autoinvalida | función `generar_qr_token()` + `fecha_expiracion` |
| Validación irreversible y auditada | función `validar_entrada()` + `UNIQUE(id_entrada)` en `validacion` |
| No superposición de eventos en un estadio | trigger `check_evento_solapado()` sobre `evento` (ventana de ±3h en el mismo estadio) |

Mencionar brevemente el stack y la arquitectura otra vez como cierre: PostgreSQL 15 (Neon, Linux) + ASP.NET Core 8 Minimal API + Dapper + React/Next.js 14, JWT, pgcrypto para los tokens.

---

## Preparación previa — todo lo que escribe en la base (correr ANTES de la demo, fuera de cámara)

Durante la demo en vivo **no se escribe SQL**: las tablas ya están creadas y pobladas (`01_schema_neon.sql` + `02_seed_data.sql`, comisión ya seedeada al 5% correcto), y cualquier cambio de datos en cámara lo hace el frontend a través de la API. El único ajuste que puede hacer falta es este, y es opcional — solo si se quiere demostrar en vivo que la tasa es histórica/variable (bloque 3):

```sql
-- Opcional, bloque 3 (mostrar que la comisión puede cambiar en el tiempo)
update comision_historico set fecha_fin = now() where id_comision = 1;
insert into comision_historico (porcentaje, fecha_inicio, fecha_fin) values (7.00, now(), null);

-- Para el bloque 4 (forzar que el cupo se agote rápido)
update evento_sector set cupo_maximo = 2 where id_evento = 1 and id_sector = <X>;
```

## Checklist de SELECTs a tener preparados en Neon para la demo en vivo (solo lectura)

Para el bloque 3 (comisión y límite de compra), preferir **Table View** navegando por las FKs clickeables (`comision_historico` → `venta` → click en `id_venta` → `entrada` → click en `id_evento/id_sector/id_estadio` → `evento_sector`) en vez de estos `SELECT`. Quedan acá como respaldo en el SQL Editor por si Table View no alcanza para algo puntual.

```sql
-- Bloque 1 - roles
select mail, doc_pais, doc_tipo, doc_nro from usuario;
select * from administrador;
select * from admin_pais;
select * from funcionario;
select * from usuario_general;
select * from dispositivo;

-- Bloque 2 - registro
select * from usuario_telefono where mail = '<mail>';

-- Bloque 3 - venta/comisión/límite 5
select * from comision_historico order by fecha_inicio;
select * from venta order by fecha desc limit 5;
select * from entrada where id_venta = <id>;
select * from evento_sector where id_evento = 1;

-- Bloque 4 - cupo
select cupo_maximo, entradas_emitidas from evento_sector where id_evento = 1 and id_sector = <X>;

-- Bloque 5 - transferencias
select * from transfer where id_entrada = <id> order by fecha_solicitud;
select id_entrada, mail_propietario, transferencias_rest, estado from entrada where id_entrada = <id>;

-- Bloque 6 - QR dinámico
select id_token, codigo_hash, fecha_generacion, fecha_expiracion, activo
from qr_token where id_entrada = <id> order by fecha_generacion desc limit 5;

-- Bloque 7 - validación
select * from validacion order by id_validacion desc limit 5;
select estado from entrada where id_entrada = <id>;

-- Bloque 8 - estadísticas (preferir Table View → sección Views; estos quedan de respaldo)
select * from v_eventos_mas_vendidos;
select * from v_ranking_compradores;
select * from v_entradas_por_propietario where mail_propietario = '<mail>';
```

> Nombres verificados directamente contra el esquema real (`sql/01_schema_neon.sql` y `sql/02_triggers_functions.sql`): `entrada.mail_propietario`, `entrada.transferencias_rest`, `qr_token.codigo_hash`/`fecha_generacion`/`fecha_expiracion`/`activo`, `transfer.fecha_solicitud`/`fecha_respuesta`, `validacion.id_validacion`, vistas `v_eventos_mas_vendidos`, `v_ranking_compradores` y `v_entradas_por_propietario`, trigger `check_evento_solapado()` (ventana ±3h en el mismo estadio).
