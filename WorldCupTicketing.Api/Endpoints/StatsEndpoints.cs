using Dapper;
using WorldCupTicketing.Api.Data;

namespace WorldCupTicketing.Api.Endpoints;

public static class StatsEndpoints
{
    public static IEndpointRouteBuilder MapStatsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/stats/eventos-mas-vendidos", EventosMasVendidos).RequireAuthorization("Admin").WithTags("Stats");
        app.MapGet("/stats/top-compradores", TopCompradores).RequireAuthorization("Admin").WithTags("Stats");
        return app;
    }

    private static async Task<IResult> EventosMasVendidos(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var rows = await con.QueryAsync("SELECT * FROM v_eventos_mas_vendidos LIMIT 20");
        return Results.Ok(rows);
    }

    private static async Task<IResult> TopCompradores(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var rows = await con.QueryAsync("SELECT * FROM v_ranking_compradores LIMIT 20");
        return Results.Ok(rows);
    }
}
