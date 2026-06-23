using System.Web;
using Npgsql;

namespace WorldCupTicketing.Api.Data;

public sealed class DbConnectionFactory
{
    private readonly string _connectionString;

    public DbConnectionFactory(IConfiguration configuration)
    {
        var raw = configuration.GetConnectionString("DefaultConnection")
            ?? Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection");

        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new InvalidOperationException("Connection string is required. Set ConnectionStrings__DefaultConnection.");
        }

        _connectionString = NormalizeConnectionString(raw);
    }

    public NpgsqlConnection CreateConnection() => new(_connectionString);

    private static string NormalizeConnectionString(string raw)
    {
        if (!raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase)
            && !raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        {
            return raw;
        }

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.Port > 0 ? uri.Port : 5432,
            Database = uri.AbsolutePath.TrimStart('/'),
            Username = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(0) ?? ""),
            Password = Uri.UnescapeDataString(userInfo.ElementAtOrDefault(1) ?? ""),
            SslMode = SslMode.Require,
            Pooling = true
        };

        var query = HttpUtility.ParseQueryString(uri.Query);
        if (Enum.TryParse<SslMode>(query["sslmode"], true, out var sslMode))
        {
            builder.SslMode = sslMode;
        }

        if (!string.IsNullOrWhiteSpace(query["channel_binding"]))
        {
            builder["Channel Binding"] = CultureInfoInvariantTitle(query["channel_binding"]!);
        }

        return builder.ConnectionString;
    }

    private static string CultureInfoInvariantTitle(string value) =>
        value.Equals("require", StringComparison.OrdinalIgnoreCase) ? "Require" : value;
}
