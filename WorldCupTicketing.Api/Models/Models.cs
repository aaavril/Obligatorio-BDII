namespace WorldCupTicketing.Api.Models;

public sealed record RegisterRequest(
    string Mail,
    string DocPais,
    string DocTipo,
    string DocNro,
    string DirPais,
    string DirCiudad,
    string DirCalle,
    string Password,
    IReadOnlyList<string>? Telefonos);

public sealed record LoginRequest(string Mail, string Password);

public sealed record VentaItemRequest(int IdSector, int IdEstadio, int Cantidad);

public sealed record CreateVentaRequest(int IdEvento, IReadOnlyList<VentaItemRequest> Items);

public sealed record CreateTransferRequest(int IdEntrada, string MailDestinatario);

public sealed record ValidacionRequest(string CodigoHash, int IdDispositivo);

public sealed record CreateEventoRequest(int IdEstadio, DateTimeOffset FechaHora, int IdEquipoLocal, int IdEquipoVisit);

public sealed record AddEventoSectorRequest(int IdSector, int IdEstadio, int CupoMaximo);
