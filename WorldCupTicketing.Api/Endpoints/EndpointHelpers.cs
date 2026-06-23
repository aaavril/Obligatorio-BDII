using System.Security.Claims;
using Npgsql;

namespace WorldCupTicketing.Api.Endpoints;

internal static class EndpointHelpers
{
    public static string? CurrentMail(this ClaimsPrincipal user) =>
        user.FindFirst(ClaimTypes.Email)?.Value;

    public static string[] CurrentRoles(this ClaimsPrincipal user) =>
        user.FindAll(ClaimTypes.Role).Select(c => c.Value).ToArray();

    public static string DbMessage(this NpgsqlException ex) =>
        ex is PostgresException pg ? pg.MessageText : ex.Message;
}
