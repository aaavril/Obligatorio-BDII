CREATE OR REPLACE FUNCTION controlar_insert_entrada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_total INT;
BEGIN
    -- Limite de 5 entradas POR TRANSACCION (misma venta), no acumulado en el tiempo
    -- por usuario+evento. Asi lo exige la letra: "no podre comprar mas de 5 entradas
    -- en la misma transaccion".
    SELECT COUNT(*)
    INTO v_total
    FROM entrada
    WHERE id_venta = NEW.id_venta
      AND estado <> 'cancelada';

    IF v_total >= 5 THEN
        RAISE EXCEPTION 'No se pueden comprar mas de 5 entradas en la misma transaccion.';
    END IF;

    UPDATE evento_sector
    SET entradas_emitidas = entradas_emitidas + 1
    WHERE id_evento = NEW.id_evento
      AND id_sector = NEW.id_sector
      AND id_estadio = NEW.id_estadio
      AND entradas_emitidas < cupo_maximo;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No hay cupo disponible para el sector seleccionado.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_controlar_insert_entrada ON entrada;
CREATE TRIGGER trg_controlar_insert_entrada
BEFORE INSERT ON entrada
FOR EACH ROW
EXECUTE FUNCTION controlar_insert_entrada();

CREATE OR REPLACE FUNCTION check_evento_solapado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM evento e
        WHERE e.id_estadio = NEW.id_estadio
          AND e.id_evento <> COALESCE(NEW.id_evento, -1)
          AND e.estado::TEXT NOT IN ('finalizado', 'cancelado')
          AND NEW.estado::TEXT NOT IN ('finalizado', 'cancelado')
          AND NEW.fecha_hora BETWEEN e.fecha_hora - INTERVAL '3 hours'
                                  AND e.fecha_hora + INTERVAL '3 hours'
    ) THEN
        RAISE EXCEPTION 'Superposicion horaria en estadio %', NEW.id_estadio;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_evento_solapado ON evento;
CREATE TRIGGER trg_check_evento_solapado
BEFORE INSERT OR UPDATE ON evento
FOR EACH ROW
EXECUTE FUNCTION check_evento_solapado();

CREATE OR REPLACE FUNCTION validar_insert_transferencia()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_entrada entrada%ROWTYPE;
BEGIN
    SELECT *
    INTO v_entrada
    FROM entrada
    WHERE id_entrada = NEW.id_entrada
    FOR UPDATE;

    IF v_entrada.id_entrada IS NULL THEN
        RAISE EXCEPTION 'Entrada inexistente.';
    END IF;

    IF v_entrada.mail_propietario <> NEW.mail_remitente THEN
        RAISE EXCEPTION 'El remitente no es propietario actual de la entrada.';
    END IF;

    IF v_entrada.estado::TEXT <> 'disponible' THEN
        RAISE EXCEPTION 'La entrada no esta disponible para transferir.';
    END IF;

    IF v_entrada.transferencias_rest <= 0 THEN
        RAISE EXCEPTION 'La entrada no tiene transferencias restantes.';
    END IF;

    IF NEW.estado::TEXT <> 'pendiente' THEN
        RAISE EXCEPTION 'Una nueva transferencia debe crearse en estado pendiente.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_insert_transferencia ON transfer;
CREATE TRIGGER trg_validar_insert_transferencia
BEFORE INSERT ON transfer
FOR EACH ROW
EXECUTE FUNCTION validar_insert_transferencia();

DROP FUNCTION IF EXISTS generar_qr_token(INT);
CREATE OR REPLACE FUNCTION generar_qr_token(p_id_entrada INT)
RETURNS TABLE(id_token INT, codigo_hash TEXT, fecha_expiracion TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado TEXT;
    v_hash TEXT;
BEGIN
    SELECT e.estado::TEXT
    INTO v_estado
    FROM entrada e
    WHERE e.id_entrada = p_id_entrada;

    IF v_estado IS NULL THEN
        RAISE EXCEPTION 'Entrada inexistente.';
    END IF;

    IF v_estado <> 'disponible' THEN
        RAISE EXCEPTION 'La entrada no esta disponible para generar QR.';
    END IF;

    UPDATE qr_token
    SET activo = FALSE
    WHERE qr_token.id_entrada = p_id_entrada
      AND activo = TRUE;

    v_hash := encode(gen_random_bytes(32), 'hex');

    RETURN QUERY
    INSERT INTO qr_token (id_entrada, codigo_hash, fecha_expiracion, activo)
    VALUES (p_id_entrada, v_hash, now() + INTERVAL '30 seconds', TRUE)
    RETURNING qr_token.id_token, qr_token.codigo_hash::TEXT, qr_token.fecha_expiracion::TIMESTAMPTZ;
END;
$$;

DROP FUNCTION IF EXISTS validar_entrada(TEXT, VARCHAR, INT);
CREATE OR REPLACE FUNCTION validar_entrada(p_hash TEXT, p_mail_func VARCHAR, p_disp INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_token qr_token%ROWTYPE;
    v_entrada entrada%ROWTYPE;
BEGIN
    SELECT *
    INTO v_token
    FROM qr_token
    WHERE codigo_hash = p_hash;

    IF v_token.id_token IS NULL THEN
        RETURN 'ERROR: QR inexistente.';
    END IF;

    IF NOT v_token.activo THEN
        RETURN 'ERROR: QR inactivo.';
    END IF;

    IF v_token.fecha_expiracion < now() THEN
        UPDATE qr_token SET activo = FALSE WHERE id_token = v_token.id_token;
        RETURN 'ERROR: QR expirado.';
    END IF;

    SELECT *
    INTO v_entrada
    FROM entrada
    WHERE id_entrada = v_token.id_entrada
    FOR UPDATE;

    IF v_entrada.id_entrada IS NULL THEN
        RETURN 'ERROR: Entrada inexistente.';
    END IF;

    IF v_entrada.estado <> 'disponible' THEN
        RETURN 'ERROR: Entrada no disponible.';
    END IF;

    IF EXISTS (SELECT 1 FROM validacion WHERE id_entrada = v_entrada.id_entrada) THEN
        RETURN 'ERROR: Entrada ya validada.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM dispositivo d
        WHERE d.id_dispositivo = p_disp
          AND d.mail_funcionario = p_mail_func
          AND d.activo = TRUE
    ) THEN
        RETURN 'ERROR: Dispositivo no autorizado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM func_sector_evento fse
        WHERE fse.mail_func = p_mail_func
          AND fse.id_evento = v_entrada.id_evento
          AND fse.id_sector = v_entrada.id_sector
          AND fse.id_estadio = v_entrada.id_estadio
    ) THEN
        RETURN 'ERROR: Funcionario sin permiso para este sector.';
    END IF;

    INSERT INTO validacion (id_entrada, id_token, mail_func, id_dispositivo, codigo_qr_used)
    VALUES (v_entrada.id_entrada, v_token.id_token, p_mail_func, p_disp, p_hash);

    UPDATE entrada
    SET estado = 'usada'
    WHERE id_entrada = v_entrada.id_entrada;

    UPDATE qr_token
    SET activo = FALSE
    WHERE id_token = v_token.id_token;

    RETURN 'OK: Acceso autorizado.';
END;
$$;

DROP FUNCTION IF EXISTS aceptar_transferencia(INT);
CREATE OR REPLACE FUNCTION aceptar_transferencia(p_id_transfer INT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_transfer transfer%ROWTYPE;
    v_entrada entrada%ROWTYPE;
BEGIN
    SELECT *
    INTO v_transfer
    FROM transfer
    WHERE id_transfer = p_id_transfer
    FOR UPDATE;

    IF v_transfer.id_transfer IS NULL THEN
        RAISE EXCEPTION 'Transferencia inexistente.';
    END IF;

    IF v_transfer.estado <> 'pendiente' THEN
        RAISE EXCEPTION 'La transferencia no esta pendiente.';
    END IF;

    SELECT *
    INTO v_entrada
    FROM entrada
    WHERE id_entrada = v_transfer.id_entrada
    FOR UPDATE;

    IF v_entrada.id_entrada IS NULL THEN
        RAISE EXCEPTION 'Entrada inexistente.';
    END IF;

    IF v_entrada.estado <> 'disponible' THEN
        RAISE EXCEPTION 'La entrada no esta disponible para transferir.';
    END IF;

    IF v_entrada.mail_propietario <> v_transfer.mail_remitente THEN
        RAISE EXCEPTION 'El remitente ya no es propietario de la entrada.';
    END IF;

    IF v_entrada.transferencias_rest <= 0 THEN
        RAISE EXCEPTION 'La entrada no tiene transferencias restantes.';
    END IF;

    UPDATE entrada
    SET mail_propietario = v_transfer.mail_destinat,
        transferencias_rest = transferencias_rest - 1
    WHERE id_entrada = v_transfer.id_entrada;

    UPDATE qr_token
    SET activo = FALSE
    WHERE id_entrada = v_transfer.id_entrada
      AND activo = TRUE;

    UPDATE transfer
    SET estado = 'aceptada',
        fecha_respuesta = now()
    WHERE id_transfer = v_transfer.id_transfer;

    UPDATE transfer
    SET estado = 'cancelada',
        fecha_respuesta = now()
    WHERE id_entrada = v_transfer.id_entrada
      AND estado = 'pendiente'
      AND id_transfer <> v_transfer.id_transfer;
END;
$$;

DROP VIEW IF EXISTS v_entradas_por_propietario;
CREATE OR REPLACE VIEW v_entradas_por_propietario AS
SELECT
    e.id_entrada,
    e.id_venta,
    e.id_evento,
    ev.fecha_hora,
    ev.estado AS estado_evento,
    es.id_estadio,
    es.nombre AS estadio,
    es.ciudad,
    e.id_sector,
    s.nombre AS sector_nombre,
    s.costo_entrada,
    eq_l.nombre AS equipo_local,
    eq_v.nombre AS equipo_visitante,
    e.mail_propietario,
    e.estado,
    e.transferencias_rest
FROM entrada e
JOIN evento ev ON ev.id_evento = e.id_evento
JOIN estadio es ON es.id_estadio = e.id_estadio
JOIN sector s ON s.id_sector = e.id_sector AND s.id_estadio = e.id_estadio
JOIN equipo eq_l ON eq_l.id_equipo = ev.id_equipo_local
JOIN equipo eq_v ON eq_v.id_equipo = ev.id_equipo_visit;

DROP VIEW IF EXISTS v_eventos_mas_vendidos;
CREATE OR REPLACE VIEW v_eventos_mas_vendidos AS
SELECT
    ev.id_evento,
    eq_l.nombre AS equipo_local,
    eq_v.nombre AS equipo_visitante,
    es.nombre AS estadio,
    es.ciudad,
    ev.fecha_hora,
    COUNT(e.id_entrada)::INT AS entradas_vendidas,
    COALESCE(SUM(s.costo_entrada), 0)::NUMERIC(12,2) AS bruto_entradas
FROM evento ev
JOIN equipo eq_l ON eq_l.id_equipo = ev.id_equipo_local
JOIN equipo eq_v ON eq_v.id_equipo = ev.id_equipo_visit
JOIN estadio es ON es.id_estadio = ev.id_estadio
LEFT JOIN entrada e ON e.id_evento = ev.id_evento AND e.estado <> 'cancelada'
LEFT JOIN sector s ON s.id_sector = e.id_sector AND s.id_estadio = e.id_estadio
GROUP BY ev.id_evento, eq_l.nombre, eq_v.nombre, es.nombre, es.ciudad, ev.fecha_hora
ORDER BY entradas_vendidas DESC, ev.fecha_hora ASC;

DROP VIEW IF EXISTS v_ranking_compradores;
CREATE OR REPLACE VIEW v_ranking_compradores AS
WITH entradas_por_usuario AS (
    SELECT v.mail_usuario, COUNT(e.id_entrada)::INT AS entradas_compradas
    FROM venta v
    JOIN entrada e ON e.id_venta = v.id_venta AND e.estado <> 'cancelada'
    WHERE v.estado = 'pagada'
    GROUP BY v.mail_usuario
),
montos_por_usuario AS (
    SELECT mail_usuario, SUM(monto_total)::NUMERIC(12,2) AS monto_total_compras
    FROM venta
    WHERE estado = 'pagada'
    GROUP BY mail_usuario
)
SELECT
    u.mail,
    u.doc_pais,
    u.doc_tipo,
    u.doc_nro,
    COALESCE(epu.entradas_compradas, 0)::INT AS entradas_compradas,
    COALESCE(mpu.monto_total_compras, 0)::NUMERIC(12,2) AS monto_total_compras
FROM usuario_general ug
JOIN usuario u ON u.mail = ug.mail
LEFT JOIN entradas_por_usuario epu ON epu.mail_usuario = ug.mail
LEFT JOIN montos_por_usuario mpu ON mpu.mail_usuario = ug.mail
ORDER BY entradas_compradas DESC, monto_total_compras DESC;
