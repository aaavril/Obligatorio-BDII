using System.Security.Claims;
using Dapper;
using Npgsql;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Models;

namespace WorldCupTicketing.Api.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/admin/mi-pais", MiPais).RequireAuthorization("Admin").WithTags("Admin");
        app.MapGet("/admin/eventos", MisEventos).RequireAuthorization("Admin").WithTags("Admin");
        app.MapPost("/admin/eventos", CrearEvento).RequireAuthorization("Admin").WithTags("Admin");
        app.MapPost("/admin/eventos/{id:int}/sectores", AgregarSector).RequireAuthorization("Admin").WithTags("Admin");
        app.MapGet("/admin/usuarios", Usuarios).RequireAuthorization("Admin").WithTags("Admin");
        app.MapPatch("/admin/usuarios/{mail}/verificar", VerificarUsuario).RequireAuthorization("Admin").WithTags("Admin");
        return app;
    }

    private static async Task<IResult> MiPais(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var pais = await con.QueryFirstOrDefaultAsync("""
            SELECT DISTINCT p.id_pais, p.nombre, p.codigo_iso
            FROM pais_sede p
            WHERE p.id_pais IN (
                SELECT a.id_pais_gestionado
                FROM administrador a
                WHERE a.mail = @Mail
                UNION
                SELECT ap.id_pais
                FROM admin_pais ap
                WHERE ap.mail_admin = @Mail
            )
            ORDER BY p.id_pais
            LIMIT 1
            """,
            new { Mail = mail });

        return pais is null ? Results.NotFound(new { error = "Pais no encontrado." }) : Results.Ok(pais);
    }

    private static async Task<IResult> MisEventos(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var eventos = await con.QueryAsync("""
            SELECT
                ev.id_evento,
                ev.fecha_hora,
                ev.estado,
                ev.id_estadio,
                es.nombre AS estadio,
                es.ciudad,
                ev.id_equipo_local,
                eq_l.nombre AS equipo_local,
                ev.id_equipo_visit,
                eq_v.nombre AS equipo_visitante
            FROM evento ev
            JOIN estadio es ON es.id_estadio = ev.id_estadio
            JOIN equipo eq_l ON eq_l.id_equipo = ev.id_equipo_local
            JOIN equipo eq_v ON eq_v.id_equipo = ev.id_equipo_visit
            WHERE ev.mail_admin = @Mail
            ORDER BY ev.fecha_hora DESC
            """,
            new { Mail = mail });

        return Results.Ok(eventos);
    }

    private static async Task<IResult> CrearEvento(CreateEventoRequest request, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        try
        {
            var estadioPermitido = await con.ExecuteScalarAsync<bool>("""
                SELECT EXISTS (
                    SELECT 1
                    FROM estadio e
                    WHERE e.id_estadio = @IdEstadio
                      AND e.id_pais IN (
                          SELECT a.id_pais_gestionado
                          FROM administrador a
                          WHERE a.mail = @Mail
                          UNION
                          SELECT ap.id_pais
                          FROM admin_pais ap
                          WHERE ap.mail_admin = @Mail
                      )
                      AND e.id_estadio = @IdEstadio
                )
                """,
                new { Mail = mail, request.IdEstadio });

            if (!estadioPermitido)
            {
                return Results.Forbid();
            }

            var idEvento = await con.ExecuteScalarAsync<int>("""
                INSERT INTO evento (id_estadio, mail_admin, fecha_hora, estado, id_equipo_local, id_equipo_visit)
                VALUES (@IdEstadio, @Mail, @FechaHora, 'programado', @IdEquipoLocal, @IdEquipoVisit)
                RETURNING id_evento
                """,
                new
                {
                    request.IdEstadio,
                    Mail = mail,
                    FechaHora = request.FechaHora.UtcDateTime,
                    request.IdEquipoLocal,
                    request.IdEquipoVisit
                });

            return Results.Created($"/admin/eventos/{idEvento}", new { idEvento });
        }
        catch (NpgsqlException ex)
        {
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> AgregarSector(int id, AddEventoSectorRequest request, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        try
        {
            var eventoPermitido = await con.ExecuteScalarAsync<bool>(
                "SELECT EXISTS (SELECT 1 FROM evento WHERE id_evento = @Id AND mail_admin = @Mail AND id_estadio = @IdEstadio)",
                new { Id = id, Mail = mail, request.IdEstadio });

            if (!eventoPermitido)
            {
                return Results.Forbid();
            }

            await con.ExecuteAsync("""
                INSERT INTO evento_sector (id_evento, id_sector, id_estadio, cupo_maximo)
                VALUES (@IdEvento, @IdSector, @IdEstadio, @CupoMaximo)
                ON CONFLICT (id_evento, id_sector, id_estadio) DO UPDATE
                SET cupo_maximo = EXCLUDED.cupo_maximo
                """,
                new { IdEvento = id, request.IdSector, request.IdEstadio, request.CupoMaximo });

            return Results.Ok(new { ok = true });
        }
        catch (NpgsqlException ex)
        {
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> Usuarios(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var usuarios = await con.QueryAsync("""
            SELECT
                u.mail,
                u.doc_pais,
                u.doc_tipo,
                u.doc_nro,
                u.dir_pais,
                u.dir_ciudad,
                ug.fecha_registro,
                ug.estado_verif
            FROM usuario_general ug
            JOIN usuario u ON u.mail = ug.mail
            ORDER BY ug.estado_verif, ug.fecha_registro DESC
            """);

        return Results.Ok(usuarios);
    }

    private static async Task<IResult> VerificarUsuario(string mail, DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var affected = await con.ExecuteAsync("""
            UPDATE usuario_general
            SET estado_verif = 'verificado'
            WHERE mail = @Mail
            """,
            new { Mail = mail });

        return affected == 0
            ? Results.NotFound(new { error = "Usuario no encontrado." })
            : Results.Ok(new { ok = true });
    }
}
