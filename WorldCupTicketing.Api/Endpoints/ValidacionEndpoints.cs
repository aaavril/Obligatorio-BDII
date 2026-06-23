using System.Security.Claims;
using Dapper;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Models;

namespace WorldCupTicketing.Api.Endpoints;

public static class ValidacionEndpoints
{
    public static IEndpointRouteBuilder MapValidacionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/validaciones", Validar).RequireAuthorization("Funcionario").WithTags("Validaciones");
        app.MapGet("/validaciones/mis-dispositivos", MisDispositivos).RequireAuthorization("Funcionario").WithTags("Validaciones");
        return app;
    }

    private static async Task<IResult> Validar(ValidacionRequest request, ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var mensaje = await con.ExecuteScalarAsync<string>(
            "SELECT validar_entrada(@Hash, @Mail, @Disp)",
            new { Hash = request.CodigoHash, Mail = mail, Disp = request.IdDispositivo });

        return Results.Ok(new
        {
            ok = mensaje?.StartsWith("OK:", StringComparison.OrdinalIgnoreCase) == true,
            mensaje
        });
    }

    private static async Task<IResult> MisDispositivos(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var dispositivos = await con.QueryAsync("""
            SELECT id_dispositivo, descripcion, activo
            FROM dispositivo
            WHERE mail_funcionario = @Mail
              AND activo = TRUE
            ORDER BY id_dispositivo
            """,
            new { Mail = mail });

        return Results.Ok(dispositivos);
    }
}
