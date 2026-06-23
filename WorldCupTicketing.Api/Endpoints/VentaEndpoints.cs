using System.Security.Claims;
using Dapper;
using Npgsql;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Models;

namespace WorldCupTicketing.Api.Endpoints;

public static class VentaEndpoints
{
    public static IEndpointRouteBuilder MapVentaEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/ventas", CrearVenta).RequireAuthorization("UsuarioGeneral").WithTags("Ventas");
        app.MapGet("/ventas/mis-compras", MisCompras).RequireAuthorization("UsuarioGeneral").WithTags("Ventas");
        return app;
    }

    private static async Task<IResult> CrearVenta(CreateVentaRequest request, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        if (request.Items.Count == 0 || request.Items.Any(i => i.Cantidad <= 0))
        {
            return Results.BadRequest(new { error = "La venta debe incluir cantidades positivas." });
        }

        await using var con = db.CreateConnection();
        await con.OpenAsync();
        await using var tx = await con.BeginTransactionAsync();

        try
        {
            var estadoVerif = await con.ExecuteScalarAsync<string?>(
                "SELECT estado_verif::TEXT FROM usuario_general WHERE mail = @Mail",
                new { Mail = mail },
                tx);

            if (estadoVerif != "verificado")
            {
                return Results.Forbid();
            }

            var eventoOk = await con.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM evento WHERE id_evento = @IdEvento AND estado IN ('programado', 'activo'))",
                new { request.IdEvento },
                tx);

            if (!eventoOk)
            {
                return Results.BadRequest(new { error = "Evento no disponible para venta." });
            }

            var comision = await con.QueryFirstOrDefaultAsync<dynamic>("""
                SELECT id_comision, porcentaje
                FROM comision_historico
                WHERE fecha_fin IS NULL
                ORDER BY fecha_inicio DESC
                LIMIT 1
                """,
                transaction: tx);

            if (comision is null)
            {
                return Results.BadRequest(new { error = "No hay comision vigente." });
            }

            decimal subtotal = 0;
            foreach (var item in request.Items)
            {
                var sector = await con.QueryFirstOrDefaultAsync<dynamic>("""
                    SELECT s.costo_entrada, (evs.cupo_maximo - evs.entradas_emitidas)::INT AS disponibles
                    FROM evento_sector evs
                    JOIN sector s ON s.id_sector = evs.id_sector AND s.id_estadio = evs.id_estadio
                    WHERE evs.id_evento = @IdEvento
                      AND evs.id_sector = @IdSector
                      AND evs.id_estadio = @IdEstadio
                    """,
                    new { request.IdEvento, item.IdSector, item.IdEstadio },
                    tx);

                if (sector is null)
                {
                    return Results.BadRequest(new { error = "Sector inexistente para el evento." });
                }

                if ((int)sector.disponibles < item.Cantidad)
                {
                    return Results.BadRequest(new { error = "No hay suficientes entradas disponibles." });
                }

                subtotal += (decimal)sector.costo_entrada * item.Cantidad;
            }

            decimal pct = (decimal)comision.porcentaje;
            var montoTotal = Math.Round(subtotal * (1 + pct / 100), 2);
            var idVenta = await con.ExecuteScalarAsync<int>("""
                INSERT INTO venta (mail_usuario, id_comision, estado, monto_total, comision_pct)
                VALUES (@Mail, @IdComision, 'pagada', @MontoTotal, @ComisionPct)
                RETURNING id_venta
                """,
                new
                {
                    Mail = mail,
                    IdComision = (int)comision.id_comision,
                    MontoTotal = montoTotal,
                    ComisionPct = pct
                },
                tx);

            foreach (var item in request.Items)
            {
                for (var i = 0; i < item.Cantidad; i++)
                {
                    await con.ExecuteAsync("""
                        INSERT INTO entrada (id_venta, id_evento, id_sector, id_estadio, mail_propietario, estado)
                        VALUES (@IdVenta, @IdEvento, @IdSector, @IdEstadio, @Mail, 'disponible')
                        """,
                        new { IdVenta = idVenta, request.IdEvento, item.IdSector, item.IdEstadio, Mail = mail },
                        tx);
                }
            }

            await tx.CommitAsync();
            return Results.Created($"/ventas/{idVenta}", new { idVenta, montoTotal });
        }
        catch (NpgsqlException ex)
        {
            await tx.RollbackAsync();
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> MisCompras(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var compras = await con.QueryAsync("""
            SELECT
                v.id_venta,
                v.fecha,
                v.estado,
                v.monto_total,
                v.comision_pct,
                COUNT(e.id_entrada)::INT AS entradas
            FROM venta v
            LEFT JOIN entrada e ON e.id_venta = v.id_venta
            WHERE v.mail_usuario = @Mail
            GROUP BY v.id_venta, v.fecha, v.estado, v.monto_total, v.comision_pct
            ORDER BY v.fecha DESC
            """,
            new { Mail = mail });

        return Results.Ok(compras);
    }
}
