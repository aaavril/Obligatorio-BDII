param(
    [string]$ApiBaseUrl = "http://localhost:5000",
    [string]$FrontendBaseUrl = "http://localhost:3000",
    [string]$AdminMail = "admin.usa@mundial2026.com",
    [string]$AdminPassword = "Admin123!",
    [string]$FuncionarioMail = "func001@mundial2026.com",
    [string]$FuncionarioPassword = "Func123!",
    [string]$DestinoMail = "usuario.test@test.com",
    [string]$DestinoPassword = "Test123!"
)

$ErrorActionPreference = "Stop"

function Invoke-JsonApi {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null,
        [string]$Token = $null
    )

    $headers = @{}
    if ($Token) {
        $headers.Authorization = "Bearer $Token"
    }

    $params = @{
        Uri        = "$ApiBaseUrl$Path"
        Method     = $Method
        Headers    = $headers
        TimeoutSec = 30
    }

    if ($null -ne $Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
        $params.ContentType = "application/json"
    }

    try {
        Invoke-RestMethod @params
    }
    catch {
        $resp = $_.Exception.Response
        if ($resp -and $resp.GetResponseStream()) {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $text = $reader.ReadToEnd()
            throw "HTTP $([int]$resp.StatusCode) $Path $text"
        }
        throw
    }
}

function Invoke-JsonApiExpectFailure {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$Path,
        [object]$Body = $null,
        [string]$Token = $null
    )

    try {
        Invoke-JsonApi $Method $Path $Body $Token | Out-Null
        return [pscustomobject]@{ Failed = $false; Message = "Request succeeded unexpectedly." }
    }
    catch {
        return [pscustomobject]@{ Failed = $true; Message = $_.Exception.Message }
    }
}

function As-Items($value) {
    if ($null -eq $value) {
        return @()
    }

    if ($value -is [array] -and $value.Count -eq 1 -and $value[0] -is [array]) {
        return As-Items $value[0]
    }

    @($value | ForEach-Object { $_ })
}

$results = New-Object System.Collections.Generic.List[object]

function Add-Result([string]$Name, [bool]$Ok, [string]$Detail) {
    $results.Add([pscustomobject]@{
        Test   = $Name
        OK     = $Ok
        Detail = $Detail
    }) | Out-Null
}

$health = Invoke-JsonApi GET "/health"
Add-Result "API health" ($health.status -eq "ok") "status=$($health.status)"

$frontStatus = (Invoke-WebRequest -Uri $FrontendBaseUrl -UseBasicParsing -TimeoutSec 30).StatusCode
Add-Result "Frontend home" ($frontStatus -eq 200) "HTTP $frontStatus"

$eventos = As-Items (Invoke-JsonApi GET "/eventos")
$evento = $eventos[0]
if (-not $evento) {
    throw "No hay eventos publicados."
}
Add-Result "GET /eventos" $true "eventos=$($eventos.Count), first=$($evento.id_evento)"

$detalle = Invoke-JsonApi GET "/eventos/$($evento.id_evento)"
$sectores = As-Items $detalle.sectores
$sector = @(($sectores | Where-Object { [int]$_.disponibles -gt 0 }))[0]
if (-not $sector) {
    throw "No hay sectores disponibles para comprar."
}
Add-Result "GET /eventos/{id}" $true "sector=$($sector.nombre), disponibles=$($sector.disponibles)"

$admin = Invoke-JsonApi POST "/auth/login" @{
    mail     = $AdminMail
    password = $AdminPassword
}
Add-Result "Login admin" ($admin.roles -contains "administrador") "roles=$($admin.roles -join ',')"

$overlapDate = ([DateTime]::SpecifyKind($detalle.evento.fecha_hora, [System.DateTimeKind]::Utc)).AddHours(1).ToString("o")
$overlap = Invoke-JsonApiExpectFailure POST "/admin/eventos" @{
    idEstadio      = [int]$detalle.evento.id_estadio
    fechaHora      = $overlapDate
    idEquipoLocal  = [int]$detalle.evento.id_equipo_local
    idEquipoVisit  = [int]$detalle.evento.id_equipo_visit
} $admin.token
Add-Result "Bloquea evento solapado" $overlap.Failed $overlap.Message

$func = Invoke-JsonApi POST "/auth/login" @{
    mail     = $FuncionarioMail
    password = $FuncionarioPassword
}
Add-Result "Login funcionario" ($func.roles -contains "funcionario") "roles=$($func.roles -join ',')"

$destino = Invoke-JsonApi POST "/auth/login" @{
    mail     = $DestinoMail
    password = $DestinoPassword
}
Add-Result "Login usuario destino" ($destino.roles -contains "usuario_general") "roles=$($destino.roles -join ',')"

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$mail = "smoke.$suffix@test.com"
$doc = "SMK$suffix"

Invoke-JsonApi POST "/auth/register" @{
    mail      = $mail
    docPais   = "URY"
    docTipo   = "CI"
    docNro    = $doc
    dirPais   = "Uruguay"
    dirCiudad = "Montevideo"
    dirCalle  = "Smoke Test 123"
    password  = "Smoke123!"
    telefonos = @("+59899000000")
} | Out-Null
Add-Result "Registro usuario temporal" $true $mail

$encodedMail = [Uri]::EscapeDataString($mail)
Invoke-JsonApi PATCH "/admin/usuarios/$encodedMail/verificar" $null $admin.token | Out-Null
Add-Result "Admin verifica usuario" $true $mail

$smoke = Invoke-JsonApi POST "/auth/login" @{
    mail     = $mail
    password = "Smoke123!"
}
Add-Result "Login usuario temporal" ($smoke.roles -contains "usuario_general") "roles=$($smoke.roles -join ',')"

$venta = Invoke-JsonApi POST "/ventas" @{
    idEvento = [int]$evento.id_evento
    items    = @(@{
        idSector  = [int]$sector.id_sector
        idEstadio = [int]$sector.id_estadio
        cantidad  = 1
    })
} $smoke.token
Add-Result "Compra 1 entrada" ($null -ne $venta.idVenta -or $null -ne $venta.id_venta) "venta=$($venta.idVenta)$($venta.id_venta), monto=$($venta.montoTotal)$($venta.monto_total)"

$entradasSmoke = As-Items (Invoke-JsonApi GET "/entradas/mis-entradas" $null $smoke.token)
$entrada = @(($entradasSmoke | Where-Object { [int]$_.id_evento -eq [int]$evento.id_evento } | Sort-Object id_entrada -Descending))[0]
if (-not $entrada) {
    throw "No se encontro la entrada comprada."
}
Add-Result "Mis entradas comprador" $true "entrada=$($entrada.id_entrada)"

$transfer = Invoke-JsonApi POST "/transferencias" @{
    idEntrada        = [int]$entrada.id_entrada
    mailDestinatario = $DestinoMail
} $smoke.token
$idTransfer = if ($transfer.idTransfer) { $transfer.idTransfer } else { $transfer.id_transfer }
Add-Result "Crear transferencia" $true "transfer=$idTransfer"

$pendientes = As-Items (Invoke-JsonApi GET "/transferencias/pendientes" $null $destino.token)
$pend = @(($pendientes | Where-Object { [int]$_.id_transfer -eq [int]$idTransfer }))[0]
if (-not $pend) {
    throw "La transferencia no aparece como pendiente para el destinatario."
}
Add-Result "Pendiente destinatario" $true "transfer=$($pend.id_transfer)"

Invoke-JsonApi PUT "/transferencias/$idTransfer/aceptar" $null $destino.token | Out-Null
Add-Result "Aceptar transferencia" $true "transfer=$idTransfer"

$qr = Invoke-JsonApi GET "/entradas/$($entrada.id_entrada)/qr" $null $destino.token
$qrOk = ($qr.codigoHash.Length -ge 32) -and $qr.qrBase64.StartsWith("data:image/png;base64,")
Add-Result "Generar QR" $qrOk "hashLength=$($qr.codigoHash.Length)"

$devices = @(Invoke-RestMethod -Uri "$ApiBaseUrl/validaciones/mis-dispositivos" -Method GET -Headers @{ Authorization = "Bearer $($func.token)" } -TimeoutSec 30)
if ($devices.Count -lt 1) {
    throw "Funcionario sin dispositivos activos."
}

$validation = Invoke-JsonApi POST "/validaciones" @{
    codigoHash    = $qr.codigoHash
    idDispositivo = [int]$devices[0].id_dispositivo
} $func.token
Add-Result "Validar QR" ([bool]$validation.ok) $validation.mensaje

$second = Invoke-JsonApi POST "/validaciones" @{
    codigoHash    = $qr.codigoHash
    idDispositivo = [int]$devices[0].id_dispositivo
} $func.token
Add-Result "Revalidacion bloqueada" (-not [bool]$second.ok) $second.mensaje

$failures = @($results | Where-Object { -not $_.OK })
$results | Format-Table -AutoSize

if ($failures.Count -gt 0) {
    throw "$($failures.Count) smoke test(s) failed."
}

Write-Host "Smoke tests OK" -ForegroundColor Green
