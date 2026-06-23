CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
    CREATE TYPE sector_nombre_enum AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE evento_estado_enum AS ENUM ('programado', 'activo', 'cancelado', 'finalizado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE venta_estado_enum AS ENUM ('pendiente', 'pagada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE entrada_estado_enum AS ENUM ('disponible', 'usada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE transfer_estado_enum AS ENUM ('pendiente', 'aceptada', 'rechazada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE estado_verif_enum AS ENUM ('pendiente', 'verificado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    IF to_regtype('estado_entrada') IS NOT NULL THEN
        ALTER TYPE estado_entrada ADD VALUE IF NOT EXISTS 'usada';
        ALTER TYPE estado_entrada ADD VALUE IF NOT EXISTS 'cancelada';
    END IF;

    IF to_regtype('estado_venta') IS NOT NULL THEN
        ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'pagada';
        ALTER TYPE estado_venta ADD VALUE IF NOT EXISTS 'cancelada';
    END IF;

    IF to_regtype('estado_transfer') IS NOT NULL THEN
        ALTER TYPE estado_transfer ADD VALUE IF NOT EXISTS 'cancelada';
    END IF;

    IF to_regtype('estado_evento') IS NOT NULL THEN
        ALTER TYPE estado_evento ADD VALUE IF NOT EXISTS 'cancelado';
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS pais_sede (
    id_pais INT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    codigo_iso CHAR(3) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS estadio (
    id_estadio SERIAL PRIMARY KEY,
    id_pais INT NOT NULL REFERENCES pais_sede(id_pais),
    nombre VARCHAR(150) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    direccion VARCHAR(180) NOT NULL
);

CREATE TABLE IF NOT EXISTS sector (
    id_sector SMALLINT NOT NULL,
    id_estadio INT NOT NULL REFERENCES estadio(id_estadio) ON DELETE CASCADE,
    nombre sector_nombre_enum NOT NULL,
    capacidad_max INT NOT NULL CHECK (capacidad_max > 0),
    costo_entrada NUMERIC(10,2) NOT NULL CHECK (costo_entrada >= 0),
    PRIMARY KEY (id_sector, id_estadio),
    UNIQUE (id_estadio, nombre)
);

CREATE TABLE IF NOT EXISTS equipo (
    id_equipo SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    pais VARCHAR(100) NOT NULL,
    grupo_mundial CHAR(1),
    fase VARCHAR(60) NOT NULL DEFAULT 'grupos'
);

CREATE TABLE IF NOT EXISTS usuario (
    mail VARCHAR(180) PRIMARY KEY,
    doc_pais VARCHAR(60) NOT NULL,
    doc_tipo VARCHAR(30) NOT NULL,
    doc_nro VARCHAR(60) NOT NULL,
    dir_pais VARCHAR(80) NOT NULL,
    dir_ciudad VARCHAR(100) NOT NULL,
    dir_calle VARCHAR(160) NOT NULL,
    password_hash TEXT NOT NULL,
    UNIQUE (doc_pais, doc_tipo, doc_nro)
);

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS dir_ciudad VARCHAR(100);
UPDATE usuario
SET dir_ciudad = COALESCE(dir_ciudad, dir_localidad, 'Sin ciudad')
WHERE dir_ciudad IS NULL;
ALTER TABLE usuario ALTER COLUMN dir_ciudad SET DEFAULT 'Sin ciudad';
ALTER TABLE usuario ALTER COLUMN dir_ciudad SET NOT NULL;

CREATE TABLE IF NOT EXISTS usuario_telefono (
    mail VARCHAR(180) NOT NULL REFERENCES usuario(mail) ON DELETE CASCADE,
    telefono VARCHAR(40) NOT NULL,
    PRIMARY KEY (mail, telefono)
);

CREATE TABLE IF NOT EXISTS administrador (
    mail VARCHAR(180) PRIMARY KEY REFERENCES usuario(mail) ON DELETE CASCADE,
    fecha_asignacion DATE NOT NULL DEFAULT CURRENT_DATE,
    id_pais_gestionado INT NOT NULL UNIQUE REFERENCES pais_sede(id_pais)
);

CREATE TABLE IF NOT EXISTS admin_pais (
    mail_admin VARCHAR(180) NOT NULL REFERENCES administrador(mail) ON DELETE CASCADE,
    id_pais INT NOT NULL REFERENCES pais_sede(id_pais),
    PRIMARY KEY (mail_admin, id_pais)
);

CREATE TABLE IF NOT EXISTS funcionario (
    mail VARCHAR(180) PRIMARY KEY REFERENCES usuario(mail) ON DELETE CASCADE,
    nro_legajo VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuario_general (
    mail VARCHAR(180) PRIMARY KEY REFERENCES usuario(mail) ON DELETE CASCADE,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado_verif estado_verif_enum NOT NULL DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS evento (
    id_evento SERIAL PRIMARY KEY,
    id_estadio INT NOT NULL REFERENCES estadio(id_estadio),
    mail_admin VARCHAR(180) NOT NULL REFERENCES administrador(mail),
    fecha_hora TIMESTAMPTZ NOT NULL,
    estado evento_estado_enum NOT NULL DEFAULT 'programado',
    id_equipo_local INT NOT NULL REFERENCES equipo(id_equipo),
    id_equipo_visit INT NOT NULL REFERENCES equipo(id_equipo),
    CHECK (id_equipo_local <> id_equipo_visit),
    UNIQUE (id_evento, id_estadio)
);

CREATE TABLE IF NOT EXISTS evento_sector (
    id_evento INT NOT NULL,
    id_sector SMALLINT NOT NULL,
    id_estadio INT NOT NULL,
    cupo_maximo INT NOT NULL CHECK (cupo_maximo > 0),
    entradas_emitidas INT NOT NULL DEFAULT 0 CHECK (entradas_emitidas >= 0),
    PRIMARY KEY (id_evento, id_sector, id_estadio),
    FOREIGN KEY (id_evento, id_estadio) REFERENCES evento(id_evento, id_estadio) ON DELETE CASCADE,
    FOREIGN KEY (id_sector, id_estadio) REFERENCES sector(id_sector, id_estadio),
    CHECK (entradas_emitidas <= cupo_maximo)
);

CREATE TABLE IF NOT EXISTS comision_historico (
    id_comision SERIAL PRIMARY KEY,
    porcentaje NUMERIC(5,2) NOT NULL CHECK (porcentaje >= 0),
    fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_fin TIMESTAMPTZ,
    CHECK (fecha_fin IS NULL OR fecha_fin > fecha_inicio)
);

CREATE TABLE IF NOT EXISTS venta (
    id_venta SERIAL PRIMARY KEY,
    mail_usuario VARCHAR(180) NOT NULL REFERENCES usuario_general(mail),
    id_comision INT NOT NULL REFERENCES comision_historico(id_comision),
    fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado venta_estado_enum NOT NULL DEFAULT 'pendiente',
    monto_total NUMERIC(12,2) NOT NULL CHECK (monto_total >= 0),
    comision_pct NUMERIC(5,2) NOT NULL CHECK (comision_pct >= 0)
);

CREATE TABLE IF NOT EXISTS entrada (
    id_entrada SERIAL PRIMARY KEY,
    id_venta INT NOT NULL REFERENCES venta(id_venta),
    id_evento INT NOT NULL,
    id_sector SMALLINT NOT NULL,
    id_estadio INT NOT NULL,
    mail_propietario VARCHAR(180) NOT NULL REFERENCES usuario_general(mail),
    estado entrada_estado_enum NOT NULL DEFAULT 'disponible',
    transferencias_rest INT NOT NULL DEFAULT 3 CHECK (transferencias_rest >= 0),
    FOREIGN KEY (id_evento, id_sector, id_estadio) REFERENCES evento_sector(id_evento, id_sector, id_estadio)
);

CREATE INDEX IF NOT EXISTS ix_entrada_propietario_estado ON entrada(mail_propietario, estado);
CREATE INDEX IF NOT EXISTS ix_entrada_evento_propietario ON entrada(id_evento, mail_propietario);

CREATE TABLE IF NOT EXISTS transfer (
    id_transfer SERIAL PRIMARY KEY,
    id_entrada INT NOT NULL REFERENCES entrada(id_entrada) ON DELETE CASCADE,
    mail_remitente VARCHAR(180) NOT NULL REFERENCES usuario_general(mail),
    mail_destinat VARCHAR(180) NOT NULL REFERENCES usuario_general(mail),
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_respuesta TIMESTAMPTZ,
    estado transfer_estado_enum NOT NULL DEFAULT 'pendiente',
    CHECK (mail_remitente <> mail_destinat)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_transfer_pendiente_entrada
    ON transfer(id_entrada)
    WHERE estado = 'pendiente';

CREATE TABLE IF NOT EXISTS qr_token (
    id_token SERIAL PRIMARY KEY,
    id_entrada INT NOT NULL REFERENCES entrada(id_entrada) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL UNIQUE,
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT now(),
    fecha_expiracion TIMESTAMPTZ NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

DROP INDEX IF EXISTS ix_qr_token_entrada_activo;
CREATE INDEX IF NOT EXISTS ix_qr_token_activo
    ON qr_token(id_entrada, codigo_hash)
    WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS dispositivo (
    id_dispositivo SERIAL PRIMARY KEY,
    mail_funcionario VARCHAR(180) NOT NULL REFERENCES funcionario(mail) ON DELETE CASCADE,
    descripcion VARCHAR(160) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS validacion (
    id_validacion SERIAL PRIMARY KEY,
    id_entrada INT NOT NULL REFERENCES entrada(id_entrada),
    id_token INT NOT NULL REFERENCES qr_token(id_token),
    mail_func VARCHAR(180) NOT NULL REFERENCES funcionario(mail),
    id_dispositivo INT NOT NULL REFERENCES dispositivo(id_dispositivo),
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    codigo_qr_used TEXT NOT NULL,
    UNIQUE (id_entrada)
);

CREATE TABLE IF NOT EXISTS func_sector_evento (
    mail_func VARCHAR(180) NOT NULL REFERENCES funcionario(mail) ON DELETE CASCADE,
    id_evento INT NOT NULL,
    id_sector SMALLINT NOT NULL,
    id_estadio INT NOT NULL,
    PRIMARY KEY (mail_func, id_evento, id_sector, id_estadio),
    FOREIGN KEY (id_evento, id_sector, id_estadio) REFERENCES evento_sector(id_evento, id_sector, id_estadio) ON DELETE CASCADE
);
