using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace WorldCupTicketing.Api.Services;

public sealed class JwtService
{
    private readonly IConfiguration _configuration;

    public JwtService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string GenerateToken(string mail, IEnumerable<string> roles)
    {
        var key = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required.");
        var issuer = _configuration["Jwt:Issuer"] ?? "mundial2026-api";
        var audience = _configuration["Jwt:Audience"] ?? "mundial2026-client";
        var expireMinutes = int.TryParse(_configuration["Jwt:ExpireMinutes"], out var minutes) ? minutes : 120;

        var claims = new List<Claim>
        {
            new(ClaimTypes.Email, mail),
            new(JwtRegisteredClaimNames.Sub, mail)
        };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            expires: DateTime.UtcNow.AddMinutes(expireMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
