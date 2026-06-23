using System.Security.Claims;
using Dapper;
using Npgsql;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Models;
using WorldCupTicketing.Api.Services;

namespace WorldCupTicketing.Api.Endpoints;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/auth").WithTags("Auth");

        group.MapPost("/register", Register);
        group.MapPost("/login", Login);
        group.MapGet("/me", Me).RequireAuthorization();

        return app;
    }

    private static async Task<IResult> Register(RegisterRequest request, DbConnectionFactory db)
    {
        if (string.IsNullOrWhiteSpace(request.Mail) || string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest(new { error = "Mail y password son obligatorios." });
        }

        await using var con = db.CreateConnection();
        await con.OpenAsync();
        await using var tx = await con.BeginTransactionAsync();

        try
        {
            var hash = BCrypt.Net.BCrypt.HashPassword(request.Password);

            await con.ExecuteAsync("""
                INSERT INTO usuario (mail, doc_pais, doc_tipo, doc_nro, dir_pais, dir_ciudad, dir_calle, password_hash)
                VALUES (@Mail, @DocPais, @DocTipo, @DocNro, @DirPais, @DirCiudad, @DirCalle, @PasswordHash)
                """,
                new
                {
                    request.Mail,
                    request.DocPais,
                    request.DocTipo,
                    request.DocNro,
                    request.DirPais,
                    request.DirCiudad,
                    request.DirCalle,
                    PasswordHash = hash
                },
                tx);

            await con.ExecuteAsync("""
                INSERT INTO usuario_general (mail, estado_verif)
                VALUES (@Mail, 'pendiente')
                """,
                new { request.Mail },
                tx);

            foreach (var telefono in request.Telefonos?.Where(t => !string.IsNullOrWhiteSpace(t)).Distinct() ?? [])
            {
                await con.ExecuteAsync("""
                    INSERT INTO usuario_telefono (mail, telefono)
                    VALUES (@Mail, @Telefono)
                    """,
                    new { request.Mail, Telefono = telefono.Trim() },
                    tx);
            }

            await tx.CommitAsync();
            return Results.Created($"/auth/me", new { request.Mail });
        }
        catch (NpgsqlException ex)
        {
            await tx.RollbackAsync();
            return Results.BadRequest(new { error = ex.DbMessage() });
        }
    }

    private static async Task<IResult> Login(LoginRequest request, DbConnectionFactory db, JwtService jwtService)
    {
        await using var con = db.CreateConnection();

        var user = await con.QueryFirstOrDefaultAsync<dynamic>(
            "SELECT mail, password_hash FROM usuario WHERE mail = @Mail",
            new { request.Mail });

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, (string)user.password_hash))
        {
            return Results.Unauthorized();
        }

        var roles = new List<string>();
        if (await con.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM administrador WHERE mail = @Mail)", new { request.Mail }))
        {
            roles.Add("administrador");
        }

        if (await con.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM funcionario WHERE mail = @Mail)", new { request.Mail }))
        {
            roles.Add("funcionario");
        }

        if (await con.ExecuteScalarAsync<bool>("SELECT EXISTS (SELECT 1 FROM usuario_general WHERE mail = @Mail)", new { request.Mail }))
        {
            roles.Add("usuario_general");
        }

        var token = jwtService.GenerateToken(request.Mail, roles);
        return Results.Ok(new { token, mail = request.Mail, roles });
    }

    private static async Task<IResult> Me(ClaimsPrincipal principal, DbConnectionFactory db)
    {
        var mail = principal.CurrentMail();
        if (mail is null)
        {
            return Results.Unauthorized();
        }

        await using var con = db.CreateConnection();
        var user = await con.QueryFirstOrDefaultAsync("""
            SELECT mail, doc_pais, doc_tipo, doc_nro, dir_pais, dir_ciudad, dir_calle
            FROM usuario
            WHERE mail = @Mail
            """,
            new { Mail = mail });

        return user is null
            ? Results.NotFound(new { error = "Usuario no encontrado." })
            : Results.Ok(new { user, roles = principal.CurrentRoles() });
    }
}
