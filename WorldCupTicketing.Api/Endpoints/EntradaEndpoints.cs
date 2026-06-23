using System.Security.Claims;
using Dapper;
using Npgsql;
using QRCoder;
using WorldCupTicketing.Api.Data;

namespace WorldCupTicketing.Api.Endpoints;

public static class EntradaEndpoints
{
    public static IEndpointRouteBuilder MapEntradaEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/entradas/mis-entradas", MisEntradas).RequireAuthorization("UsuarioGeneral").WithTags("Entradas");
        app.MapGet("/entradas/{idEntrada:int}/qr", GenerarQr).RequireAuthorization("UsuarioGeneral").WithTags("Entradas");
        return app;
    }

    private static async Task<IResult> MisEntradas(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var entradas = await con.QueryAsync("""
            SELECT *
            FROM v_entradas_por_propietario
            WHERE mail_propietario = @Mail
              AND estado = 'disponible'
            ORDER BY fecha_hora ASC, id_entrada ASC
            """,
            new { Mail = mail });

        return Results.Ok(entradas);
    }

    private static async Task<IResult> GenerarQr(int idEntrada, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var propietario = await con.ExecuteScalarAsync<string?>(
            "SELECT mail_propietario FROM entrada WHERE id_entrada = @IdEntrada",
            new { IdEntrada = idEntrada });

        if (propietario is null)
        {
            return Results.NotFound(new { error = "Entrada no encontrada." });
        }

        if (!string.Equals(propietario, mail, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Forbid();
        }

        try
        {
            var token = await con.QueryFirstAsync<dynamic>(
                "SELECT * FROM generar_qr_token(@IdEnt)",
                new { IdEnt = idEntrada });

            string hash = token.codigo_hash;
            int idToken = token.id_token;
            var fechaExpiracion = token.fecha_expiracion;

            using var qrGen = new QRCodeGenerator();
            using var qrData = qrGen.CreateQrCode(hash, QRCodeGenerator.ECCLevel.Q);
            using var qrCode = new PngByteQRCode(qrData);
            var qrBase64 = $"data:image/png;base64,{Convert.ToBase64String(qrCode.GetGraphic(10))}";

            return Results.Ok(new
            {
                idToken,
                codigoHash = hash,
                fechaExpiracion,
                qrBase64
            });
        }
        catch (NpgsqlException ex)
        {
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }
}
