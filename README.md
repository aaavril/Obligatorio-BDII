# Mundial 2026 Ticketing System

Aplicacion cliente/servidor para ticketing del Mundial 2026. Backend en ASP.NET Core 8 Minimal API con Dapper y PostgreSQL/Neon; frontend en Next.js 14 con TypeScript y Tailwind CSS.

## Requisitos

- .NET SDK 8
- Node.js 20+
- PostgreSQL 15 en Neon
- Cliente SQL como `psql`, DBeaver o consola SQL de Neon

## Base de datos

Ejecutar los scripts en Neon en este orden:

```sql
sql/01_schema_neon.sql
sql/02_triggers_functions.sql
sql/02_seed_data.sql
```

Los scripts crean schema, enums, triggers, funciones, vistas y datos de prueba. No incluyen `DROP`, por lo que no reinician una base con datos existentes.

## Configuracion

No se commitea el connection string real. Configuralo por variable de entorno:

```powershell
$env:ConnectionStrings__DefaultConnection="postgresql://USER:PASS@HOST.neon.tech/neondb?sslmode=require&channel_binding=require"
$env:Jwt__Key="mundial2026-super-secret-key-min32chars!"
```

El frontend incluye `worldcup-frontend/.env.example`; para desarrollo local tambien deje creado `worldcup-frontend/.env.local` con:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

## Ejecutar

Backend:

```powershell
cd WorldCupTicketing.Api
dotnet restore
dotnet run
```

Healthcheck:

```powershell
curl http://localhost:5000/health
```

Frontend:

```powershell
cd worldcup-frontend
npm install
npm run dev
```

Abrir `http://localhost:3000`.

## Credenciales demo

| Rol | Mail | Password |
| --- | --- | --- |
| Administrador | `admin.usa@mundial2026.com` | `Admin123!` |
| Funcionario | `func001@mundial2026.com` | `Func123!` |
| Usuario verificado | `usuario.test@test.com` | `Test123!` |

## Flujo de demo

1. Ingresar como `usuario.test@test.com`.
2. Comprar entradas desde la home o abrir `/mis-entradas`.
3. Expandir una entrada y verificar que el QR se regenere cada 29 segundos.
4. Ingresar como funcionario y validar el hash en `/validar`.
5. Ingresar como administrador para ver stats, verificar usuarios y crear eventos.

## Builds

```powershell
dotnet build .\WorldCupTicketing.Api\WorldCupTicketing.Api.csproj
cd worldcup-frontend
npm run build
```

## Tests

Con backend y frontend corriendo:

```powershell
.\tests\smoke.ps1
```

El smoke test verifica health, frontend, login por roles, bloqueo de evento solapado, registro de usuario temporal, verificacion con admin, compra, transferencia, QR dinamico, validacion de acceso y bloqueo de revalidacion.

Nota: el scaffold de Next reporta vulnerabilidades npm transitivas. No se ejecuta `npm audit fix --force` porque puede introducir cambios mayores fuera del alcance de la entrega.
