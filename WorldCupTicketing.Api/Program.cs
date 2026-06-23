using System.Text;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using WorldCupTicketing.Api.Data;
using WorldCupTicketing.Api.Endpoints;
using WorldCupTicketing.Api.Services;

var builder = WebApplication.CreateBuilder(args);

DefaultTypeMap.MatchNamesWithUnderscores = true;
builder.WebHost.UseUrls("http://localhost:5000");

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<DbConnectionFactory>();
builder.Services.AddSingleton<JwtService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("OpenCors", policy =>
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
});

var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is required.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "mundial2026-api";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "mundial2026-client";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", policy => policy.RequireRole("administrador"));
    options.AddPolicy("Funcionario", policy => policy.RequireRole("funcionario"));
    options.AddPolicy("UsuarioGeneral", policy => policy.RequireRole("usuario_general"));
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("OpenCors");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapAuthEndpoints();
app.MapEventoEndpoints();
app.MapVentaEndpoints();
app.MapEntradaEndpoints();
app.MapTransferEndpoints();
app.MapValidacionEndpoints();
app.MapAdminEndpoints();
app.MapStatsEndpoints();

app.Run();
