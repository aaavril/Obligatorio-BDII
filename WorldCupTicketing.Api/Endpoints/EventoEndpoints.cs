using Dapper;
using WorldCupTicketing.Api.Data;

namespace WorldCupTicketing.Api.Endpoints;

public static class EventoEndpoints
{
    public static IEndpointRouteBuilder MapEventoEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/eventos", GetEventos).WithTags("Eventos");
        app.MapGet("/eventos/{id:int}", GetEvento).WithTags("Eventos");
        app.MapGet("/equipos", GetEquipos).WithTags("Catalogos");
        app.MapGet("/estadios", GetEstadios).WithTags("Catalogos");
        app.MapGet("/comision/vigente", GetComisionVigente).WithTags("Catalogos");
        return app;
    }

    private static async Task<IResult> GetComisionVigente(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var comision = await con.QueryFirstOrDefaultAsync("""
            SELECT porcentaje
            FROM comision_historico
            WHERE fecha_fin IS NULL
            ORDER BY fecha_inicio DESC
            LIMIT 1
            """);

        return comision is null
            ? Results.NotFound(new { error = "No hay comision vigente." })
            : Results.Ok(comision);
    }

    private static async Task<IResult> GetEventos(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var eventos = await con.QueryAsync("""
            SELECT
                ev.id_evento,
                ev.fecha_hora,
                ev.estado,
                es.id_estadio,
                es.nombre AS estadio,
                es.ciudad,
                eq_l.nombre AS equipo_local,
                eq_v.nombre AS equipo_visitante,
                COALESCE(SUM(evs.cupo_maximo - evs.entradas_emitidas), 0)::INT AS disponibles
            FROM evento ev
            JOIN estadio es ON es.id_estadio = ev.id_estadio
            JOIN equipo eq_l ON eq_l.id_equipo = ev.id_equipo_local
            JOIN equipo eq_v ON eq_v.id_equipo = ev.id_equipo_visit
            LEFT JOIN evento_sector evs ON evs.id_evento = ev.id_evento
            WHERE ev.estado IN ('programado', 'activo')
            GROUP BY ev.id_evento, ev.fecha_hora, ev.estado, es.id_estadio, es.nombre, es.ciudad, eq_l.nombre, eq_v.nombre
            ORDER BY ev.fecha_hora ASC
            """);

        return Results.Ok(eventos);
    }

    private static async Task<IResult> GetEvento(int id, DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var evento = await con.QueryFirstOrDefaultAsync("""
            SELECT
                ev.id_evento,
                ev.fecha_hora,
                ev.estado,
                es.id_estadio,
                es.nombre AS estadio,
                es.ciudad,
                es.direccion,
                eq_l.id_equipo AS id_equipo_local,
                eq_l.nombre AS equipo_local,
                eq_v.id_equipo AS id_equipo_visit,
                eq_v.nombre AS equipo_visitante
            FROM evento ev
            JOIN estadio es ON es.id_estadio = ev.id_estadio
            JOIN equipo eq_l ON eq_l.id_equipo = ev.id_equipo_local
            JOIN equipo eq_v ON eq_v.id_equipo = ev.id_equipo_visit
            WHERE ev.id_evento = @Id
            """,
            new { Id = id });

        if (evento is null)
        {
            return Results.NotFound(new { error = "Evento no encontrado." });
        }

        var sectores = await con.QueryAsync("""
            SELECT
                evs.id_sector,
                evs.id_estadio,
                s.nombre,
                s.costo_entrada,
                evs.cupo_maximo,
                evs.entradas_emitidas,
                (evs.cupo_maximo - evs.entradas_emitidas)::INT AS disponibles
            FROM evento_sector evs
            JOIN sector s ON s.id_sector = evs.id_sector AND s.id_estadio = evs.id_estadio
            WHERE evs.id_evento = @Id
            ORDER BY evs.id_sector
            """,
            new { Id = id });

        return Results.Ok(new { evento, sectores });
    }

    private static async Task<IResult> GetEquipos(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var equipos = await con.QueryAsync("""
            SELECT id_equipo, nombre, pais, grupo_mundial, fase
            FROM equipo
            ORDER BY nombre
            """);

        return Results.Ok(equipos);
    }

    private static async Task<IResult> GetEstadios(DbConnectionFactory db)
    {
        await using var con = db.CreateConnection();
        var estadios = await con.QueryAsync("""
            SELECT e.id_estadio, e.nombre, e.ciudad, e.direccion, e.id_pais, p.nombre AS pais
            FROM estadio e
            JOIN pais_sede p ON p.id_pais = e.id_pais
            ORDER BY p.nombre, e.ciudad, e.nombre
            """);

        return Results.Ok(estadios);
    }
}
