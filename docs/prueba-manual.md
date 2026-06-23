# Prueba manual - Mundial 2026 Ticketing System

Este documento sirve para verificar manualmente los flujos principales del sistema desde el navegador.

## URLs

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:5000`
- Healthcheck: `http://localhost:5000/health`

Si el puerto `3000` esta ocupado por otro proyecto, usar siempre `3001`.

## Usuarios disponibles

| Rol | Mail | Password | Uso principal |
| --- | --- | --- | --- |
| Administrador | `admin.usa@mundial2026.com` | `Admin123!` | Dashboard, verificar usuarios, gestionar eventos |
| Funcionario | `func001@mundial2026.com` | `Func123!` | Validar QR en puerta |
| Usuario general | `usuario.test@test.com` | `Test123!` | Comprar entradas, ver QR, transferir |

Para probar transferencias de punta a punta se recomienda registrar un segundo usuario temporal desde la pantalla de registro.

Usuario temporal sugerido:

| Campo | Valor |
| --- | --- |
| Mail | `usuario.destino@test.com` |
| Password | `Destino123!` |
| Pais documento | `UY` |
| Tipo documento | `CI` |
| Numero documento | `99999999` |
| Telefonos | `+59899999999` |
| Pais | `Uruguay` |
| Ciudad | `Montevideo` |
| Direccion | `Test 1234` |

## Preparacion

1. Iniciar backend.

```powershell
cd WorldCupTicketing.Api
dotnet run
```

Resultado esperado:

- Backend escuchando en `http://localhost:5000`.
- `GET http://localhost:5000/health` devuelve `{ "status": "ok" }`.

2. Iniciar frontend.

```powershell
cd worldcup-frontend
npm run dev -- -p 3001
```

Resultado esperado:

- Frontend escuchando en `http://localhost:3001`.
- La pantalla se ve con estilos, no como HTML plano.

## Prueba 1 - Home publica y eventos

Usuario: sin login.

Pasos:

1. Abrir `http://localhost:3001`.
2. Verificar que aparezca la lista de partidos disponibles.
3. Entrar al detalle de un partido.

Resultado esperado:

- Se ven eventos programados.
- En el detalle aparecen estadio, fecha, sectores, cupos disponibles y precios.
- Si se intenta comprar sin estar logueado, redirige a login.

## Prueba 2 - Login y navbar por rol

Usuarios:

- `usuario.test@test.com`
- `func001@mundial2026.com`
- `admin.usa@mundial2026.com`

Pasos:

1. Entrar a `/auth/login`.
2. Ingresar con cada usuario.
3. Observar las opciones del navbar.
4. Cerrar sesion entre pruebas.

Resultado esperado:

- Usuario general ve opciones como eventos, mis entradas, mis compras y transferencias.
- Funcionario ve la opcion de validar QR.
- Administrador ve admin y gestion de eventos.
- Las rutas protegidas redirigen a login si no hay sesion.

## Prueba 3 - Registro de usuario nuevo

Usuario: sin login.

Pasos:

1. Entrar a `/auth/register`.
2. Registrar `usuario.destino@test.com` con los datos sugeridos.
3. Al terminar, confirmar que redirige a login.
4. Iniciar sesion con `usuario.destino@test.com`.

Resultado esperado:

- El registro se crea correctamente.
- El usuario nuevo queda en estado `pendiente`.
- Si intenta comprar estando pendiente, el backend debe bloquear la compra porque no esta verificado.

## Prueba 4 - Verificacion de usuario por admin

Usuario: `admin.usa@mundial2026.com`.

Pasos:

1. Iniciar sesion como administrador.
2. Entrar a `/admin`.
3. Buscar `usuario.destino@test.com` en la seccion Usuarios.
4. Presionar `Verificar`.

Resultado esperado:

- El usuario pasa de `pendiente` a `verificado`.
- Desaparece el boton `Verificar` para ese usuario.
- El usuario ya puede operar como usuario general.

## Prueba 5 - Compra de entradas

Usuario: `usuario.test@test.com`.

Pasos:

1. Iniciar sesion como usuario general.
2. Entrar a la home.
3. Abrir el detalle de un evento.
4. Seleccionar 1 entrada en un sector disponible.
5. Presionar `Comprar`.

Resultado esperado:

- La venta se crea correctamente.
- La app redirige a `/mis-entradas`.
- La entrada comprada aparece con numero de entrada, evento, sector y precio.

Prueba negativa:

1. En el mismo evento, intentar comprar mas de 5 entradas en total para el mismo usuario.

Resultado esperado:

- La compra falla con mensaje de error.
- No se emiten entradas por encima del limite de 5 por usuario y evento.

## Prueba 6 - Mis compras

Usuario: `usuario.test@test.com`.

Pasos:

1. Entrar a `/mis-compras`.
2. Revisar el historial de ventas.

Resultado esperado:

- Aparecen las compras realizadas.
- Se muestra fecha, estado, monto y detalle asociado.

## Prueba 7 - QR dinamico

Usuario: `usuario.test@test.com`.

Pasos:

1. Entrar a `/mis-entradas`.
2. Presionar `Ver QR` en una entrada disponible.
3. Copiar el hash/codigo mostrado junto al QR.
4. Esperar aproximadamente 30 segundos.

Resultado esperado:

- Se muestra un QR para la entrada.
- El token se renueva automaticamente cada 29 segundos.
- El hash anterior expira luego de aproximadamente 30 segundos.

## Prueba 8 - Validacion en puerta

Usuarios:

- Primero `usuario.test@test.com` para generar QR.
- Luego `func001@mundial2026.com` para validar.

Pasos:

1. Como usuario general, abrir `/mis-entradas`.
2. Presionar `Ver QR`.
3. Copiar el codigo hash vigente.
4. Cerrar sesion.
5. Iniciar sesion como funcionario.
6. Entrar a `/validar`.
7. Seleccionar un dispositivo.
8. Pegar el hash y presionar `Validar`.

Resultado esperado:

- La primera validacion responde con mensaje `OK:`.
- La entrada queda marcada como usada.

Prueba negativa:

1. Pegar el mismo hash otra vez y validar de nuevo.

Resultado esperado:

- La segunda validacion falla con mensaje `ERROR:`.
- El sistema impide reusar la misma entrada.

## Prueba 9 - Transferencia de entrada

Usuarios:

- Remitente: `usuario.test@test.com`
- Destinatario: `usuario.destino@test.com`

Preparacion:

- `usuario.destino@test.com` debe estar registrado y verificado por admin.
- `usuario.test@test.com` debe tener al menos una entrada disponible no usada.

Pasos:

1. Iniciar sesion como `usuario.test@test.com`.
2. Entrar a `/mis-entradas`.
3. En una entrada disponible, presionar `Transferir`.
4. Ingresar `usuario.destino@test.com`.
5. Enviar transferencia.
6. Cerrar sesion.
7. Iniciar sesion como `usuario.destino@test.com`.
8. Entrar a `/transferencias`.
9. Abrir la pestaña `Pendientes`.
10. Aceptar la transferencia.
11. Entrar a `/mis-entradas`.

Resultado esperado:

- La transferencia se crea en estado `pendiente`.
- El destinatario la ve en pendientes.
- Al aceptar, la entrada cambia de propietario.
- La entrada aparece en `/mis-entradas` del destinatario.

Prueba negativa:

1. Intentar transferir una entrada usada o a un usuario no verificado.

Resultado esperado:

- El backend rechaza la operacion con mensaje de error.

## Prueba 10 - Admin dashboard

Usuario: `admin.usa@mundial2026.com`.

Pasos:

1. Entrar a `/admin`.
2. Revisar `Eventos mas vendidos`.
3. Revisar `Top compradores`.
4. Revisar la lista de usuarios.

Resultado esperado:

- Las estadisticas cargan correctamente.
- Se listan como maximo 20 filas por ranking.
- El admin puede verificar usuarios pendientes.

## Prueba 11 - Admin gestion de eventos

Usuario: `admin.usa@mundial2026.com`.

Pasos:

1. Entrar a `/admin/eventos`.
2. Crear un evento nuevo usando un estadio, fecha futura y dos equipos distintos.
3. Agregar un sector al evento creado.

Resultado esperado:

- El evento se crea y aparece en la lista.
- El sector se guarda con cupo maximo.

Prueba negativa:

1. Intentar crear otro evento en el mismo estadio y horario solapado.

Resultado esperado:

- El trigger `trg_check_evento_solapado` bloquea la operacion.
- La pantalla muestra un error.

## Prueba 12 - Seguridad basica por roles

Pasos:

1. Sin login, abrir `/admin`, `/validar`, `/mis-entradas`.
2. Como usuario general, intentar abrir `/admin` y `/validar`.
3. Como funcionario, intentar abrir `/admin`.

Resultado esperado:

- Sin login, redirige a `/auth/login`.
- Usuario general no puede operar rutas de admin ni funcionario.
- Funcionario no puede operar rutas de admin.

## Prueba final automatizada opcional

Con backend y frontend corriendo:

```powershell
.\tests\smoke.ps1 -FrontendBaseUrl http://localhost:3001
```

Resultado esperado:

- El script termina con todos los pasos OK.
- Verifica healthcheck, frontend, login por roles, bloqueo de evento solapado, registro/verificacion de usuario, compra, transferencia, QR, validacion y bloqueo de revalidacion.

Nota: el smoke test crea usuarios temporales para poder probar registro y transferencia automaticamente.
