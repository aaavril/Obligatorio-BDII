# Guia de prueba manual — Mundial 2026 Ticketing

## Antes de empezar

Asegurate de que backend y frontend esten corriendo:

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:3001 |
| Backend (healthcheck) | http://localhost:5000/health |

---

## Credenciales

| Rol | Mail | Contraseña |
| --- | --- | --- |
| Administrador | `admin.usa@mundial2026.com` | `Admin123!` |
| Funcionario | `func001@mundial2026.com` | `Func123!` |
| Usuario general | `usuario.test@test.com` | `Test123!` |

---

## Prueba 1 — Home publica (sin login)

1. Abrir http://localhost:3001
2. Verificar que se ven partidos (Uruguay vs Argentina, Brasil vs Espana, etc.)
3. Hacer click en un partido — se abre el detalle con sectores, precios y cupos
4. Hacer click en **Comprar** sin estar logueado

**Resultado esperado:** redirige a la pantalla de login.

---

## Prueba 2 — Comprar entradas

1. Ir a http://localhost:3001/auth/login
2. Ingresar con `usuario.test@test.com` / `Test123!`
3. Desde la home, entrar al detalle de un partido
4. Poner cantidad `1` en un sector con cupos disponibles
5. Hacer click en **Comprar**

**Resultado esperado:** redirige a `/mis-entradas` y aparece la entrada recien comprada.

**Prueba negativa — limite de 5 entradas:**
Repetir la compra hasta superar 5 entradas en el mismo evento. El backend debe rechazarla con un mensaje de error.

---

## Prueba 3 — Ver QR y esperar regeneracion

1. Ir a http://localhost:3001/mis-entradas
2. En una entrada disponible, hacer click en **Ver QR**
3. Se muestra una imagen QR y un codigo hash debajo
4. Copiar ese hash (lo vamos a usar en la Prueba 5)
5. Esperar 30 segundos sin hacer nada

**Resultado esperado:** el QR y el hash cambian solos cada ~29 segundos.

---

## Prueba 4 — Transferir una entrada

Para esta prueba necesitas un segundo usuario. Tenes dos opciones:

**Opcion A — registrar un usuario nuevo:**
1. Ir a http://localhost:3001/auth/register
2. Completar el formulario con estos datos:

| Campo | Valor |
| --- | --- |
| Mail | `usuario.destino@test.com` |
| Contraseña | `Destino123!` |
| Pais documento | `UY` |
| Tipo documento | `CI` |
| Numero documento | `99999999` |
| Pais | `Uruguay` |
| Ciudad | `Montevideo` |
| Direccion | `Test 1234` |

3. Confirmar el registro y cerrar sesion
4. Entrar como admin (`admin.usa@mundial2026.com` / `Admin123!`)
5. Ir a http://localhost:3001/admin
6. En la seccion **Usuarios**, buscar `usuario.destino@test.com` y hacer click en **Verificar**
7. Cerrar sesion y volver a entrar como `usuario.test@test.com` / `Test123!`

**Opcion B — usar la cuenta de admin como destino (no recomendado, el admin no es usuario_general).**

**Flujo de transferencia:**
1. Ir a http://localhost:3001/mis-entradas
2. En una entrada disponible, hacer click en **Transferir**
3. Ingresar el mail del destinatario (`usuario.destino@test.com`) y hacer click en **Enviar transferencia**
4. Cerrar sesion
5. Ingresar como `usuario.destino@test.com` / `Destino123!`
6. Ir a http://localhost:3001/transferencias y abrir la pestaña **Pendientes**
7. Hacer click en **Aceptar**
8. Ir a http://localhost:3001/mis-entradas

**Resultado esperado:** la entrada aparece ahora en las entradas del destinatario.

**Prueba negativa:** intentar transferir una entrada a uno mismo — debe aparecer un mensaje de error.

---

## Prueba 5 — Validar entrada en puerta (funcionario)

Para esta prueba necesitas el hash del QR copiado en la Prueba 3 (debe ser reciente, expira a los 30 segundos).

**Si el hash ya expiro:**
1. Entrar como `usuario.test@test.com` / `Test123!`
2. Ir a http://localhost:3001/mis-entradas → **Ver QR** → copiar el hash
3. Salir de sesion rapidamente

**Validar:**
1. Entrar como `func001@mundial2026.com` / `Func123!`
2. Ir a http://localhost:3001/validar
3. Seleccionar un dispositivo del menu desplegable
4. Pegar el hash en el campo **Codigo hash**
5. Hacer click en **Validar**

**Resultado esperado:** aparece un mensaje verde **"OK: Acceso autorizado."**

**Prueba negativa — revalidacion bloqueada:**
Sin cambiar nada, hacer click en **Validar** de nuevo con el mismo hash.
**Resultado esperado:** aparece un mensaje de error **"ERROR: QR inactivo."**

---

## Prueba 6 — Panel de administrador

1. Entrar como `admin.usa@mundial2026.com` / `Admin123!`
2. Ir a http://localhost:3001/admin

**Verificar:**
- Seccion **Eventos mas vendidos** — muestra partidos con cantidad de entradas vendidas
- Seccion **Top compradores** — muestra usuarios por cantidad de entradas
- Seccion **Usuarios** — lista de usuarios generales con boton **Verificar** para los pendientes

---

## Prueba 7 — Crear evento y bloqueo por solapamiento

1. Entrar como `admin.usa@mundial2026.com` / `Admin123!`
2. Ir a http://localhost:3001/admin/eventos
3. Completar el formulario **Crear evento**:

| Campo | Valor para prueba valida |
| --- | --- |
| Estadio | MetLife Stadium |
| Fecha y hora | cualquier fecha futura sin solapamiento (ej: 20/09/2026 19:00) |
| Local | cualquier equipo |
| Visitante | un equipo diferente al local |

4. Hacer click en **Crear evento**

**Resultado esperado:** mensaje **"Evento creado."** y el evento aparece en la lista.

**Prueba negativa — solapamiento:**
Repetir el proceso con el mismo estadio y una hora dentro de las 3 horas de un evento ya existente.
Por ejemplo, MetLife tiene un evento el 10/07/2026 a las 21:00 UTC (18:00 hora Uruguay).
Intentar crear otro en MetLife entre las 15:00 y las 21:00 hora Uruguay del mismo dia.

**Resultado esperado:** error de solapamiento horario.

---

## Prueba 8 — Seguridad por roles

| Ruta | Sin login | Como usuario general | Como funcionario |
| --- | --- | --- | --- |
| `/mis-entradas` | redirige a login | acceso OK | redirige a login |
| `/validar` | redirige a login | redirige a login | acceso OK |
| `/admin` | redirige a login | redirige a login | redirige a login |

---

## Resumen de flujo completo

```
[Sin login] Ver eventos → intentar comprar → redirige a login
    ↓
[usuario.test] Login → comprar entrada → ver QR → copiar hash → cerrar sesion
    ↓
[func001] Login → /validar → pegar hash → "OK: Acceso autorizado."
                           → mismo hash → "ERROR: QR inactivo."
    ↓
[usuario.test] Login → transferir entrada → cerrar sesion
    ↓
[usuario.destino] Login → /transferencias → Pendientes → Aceptar → ver en /mis-entradas
    ↓
[admin] Login → /admin → ver stats → verificar usuarios → crear evento
```
