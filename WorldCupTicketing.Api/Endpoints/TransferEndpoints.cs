using System.Security.Claims;
using Dapper;
using Npgsql;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Models;

namespace WorldCupTicketing.Api.Endpoints;

public static class TransferEndpoints
{
    public static IEndpointRouteBuilder MapTransferEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/transferencias", Crear).RequireAuthorization("UsuarioGeneral").WithTags("Transferencias");
        app.MapGet("/transferencias/mis-transferencias", MisTransferencias).RequireAuthorization("UsuarioGeneral").WithTags("Transferencias");
        app.MapGet("/transferencias/pendientes", Pendientes).RequireAuthorization("UsuarioGeneral").WithTags("Transferencias");
        app.MapPut("/transferencias/{id:int}/aceptar", Aceptar).RequireAuthorization("UsuarioGeneral").WithTags("Transferencias");
        app.MapPut("/transferencias/{id:int}/rechazar", Rechazar).RequireAuthorization("UsuarioGeneral").WithTags("Transferencias");
        return app;
    }

    private static async Task<IResult> Crear(CreateTransferRequest request, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        if (string.Equals(mail, request.MailDestinatario, StringComparison.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new { error = "No podes transferirte una entrada a vos mismo." });
        }

        await using var con = db.CreateConnection();
        try
        {
            var entrada = await con.QueryFirstOrDefaultAsync<dynamic>("""
                SELECT mail_propietario, estado, transferencias_rest
                FROM entrada
                WHERE id_entrada = @IdEntrada
                """,
                new { request.IdEntrada });

            if (entrada is null)
            {
                return Results.NotFound(new { error = "Entrada no encontrada." });
            }

            if (!string.Equals((string)entrada.mail_propietario, mail, StringComparison.OrdinalIgnoreCase))
            {
                return Results.Forbid();
            }

            if ((string)entrada.estado != "disponible" || (int)entrada.transferencias_rest <= 0)
            {
                return Results.BadRequest(new { error = "La entrada no esta disponible para transferir." });
            }

            var destinatarioExiste = await con.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM usuario_general WHERE mail = @MailDestinatario)",
                new { request.MailDestinatario });

            if (!destinatarioExiste)
            {
                return Results.BadRequest(new { error = "El destinatario no existe como usuario general." });
            }

            var idTransfer = await con.ExecuteScalarAsync<int>("""
                INSERT INTO transfer (id_entrada, mail_remitente, mail_destinat, estado)
                VALUES (@IdEntrada, @MailRemitente, @MailDestinatario, 'pendiente')
                RETURNING id_transfer
                """,
                new { request.IdEntrada, MailRemitente = mail, request.MailDestinatario });

            return Results.Created($"/transferencias/{idTransfer}", new { idTransfer });
        }
        catch (NpgsqlException ex)
        {
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> MisTransferencias(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var transferencias = await con.QueryAsync(TransferQuery("t.mail_remitente = @Mail OR t.mail_destinat = @Mail"), new { Mail = mail });
        return Results.Ok(transferencias);
    }

    private static async Task<IResult> Pendientes(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var transferencias = await con.QueryAsync(TransferQuery("t.mail_destinat = @Mail AND t.estado = 'pendiente'"), new { Mail = mail });
        return Results.Ok(transferencias);
    }

    private static async Task<IResult> Aceptar(int id, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        try
        {
            var esDestinatario = await con.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM transfer WHERE id_transfer = @Id AND mail_destinat = @Mail)",
                new { Id = id, Mail = mail });

            if (!esDestinatario)
            {
                return Results.Forbid();
            }

            await con.ExecuteAsync("SELECT aceptar_transferencia(@Id)", new { Id = id });
            return Results.Ok(new { ok = true });
        }
        catch (NpgsqlException ex)
        {
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> Rechazar(int id, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var affected = await con.ExecuteAsync("""
            UPDATE transfer
            SET estado = 'rechazada',
                fecha_respuesta = now()
            WHERE id_transfer = @Id
              AND mail_destinat = @Mail
              AND estado = 'pendiente'
            """,
            new { Id = id, Mail = mail });

        return affected == 0
            ? Results.NotFound(new { error = "Transferencia pendiente no encontrada." })
            : Results.Ok(new { ok = true });
    }

    private static string TransferQuery(string where) => $"""
        SELECT
            t.id_transfer,
            t.id_entrada,
            t.mail_remitente,
            t.mail_destinat,
            t.fecha_solicitud,
            t.fecha_respuesta,
            t.estado,
            v.equipo_local,
            v.equipo_visitante,
            v.estadio,
            v.ciudad,
            v.fecha_hora,
            v.sector_nombre
        FROM transfer t
        JOIN v_entradas_por_propietario v ON v.id_entrada = t.id_entrada
        WHERE {where}
        ORDER BY t.fecha_solicitud DESC
        """;
}
