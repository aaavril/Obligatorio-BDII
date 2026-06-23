INSERT INTO pais_sede (id_pais, nombre, codigo_iso) VALUES
(1, 'Estados Unidos', 'USA'),
(2, 'Canada', 'CAN'),
(3, 'Mexico', 'MEX')
ON CONFLICT (id_pais) DO UPDATE SET nombre = EXCLUDED.nombre, codigo_iso = EXCLUDED.codigo_iso;

INSERT INTO estadio (id_estadio, id_pais, nombre, ciudad, direccion) VALUES
(1, 1, 'MetLife Stadium', 'East Rutherford', '1 MetLife Stadium Dr'),
(2, 1, 'SoFi Stadium', 'Inglewood', '1001 Stadium Dr'),
(3, 3, 'Estadio Azteca', 'Ciudad de Mexico', 'Calz. de Tlalpan 3465'),
(4, 2, 'BC Place', 'Vancouver', '777 Pacific Blvd')
ON CONFLICT (id_estadio) DO UPDATE
SET id_pais = EXCLUDED.id_pais, nombre = EXCLUDED.nombre, ciudad = EXCLUDED.ciudad, direccion = EXCLUDED.direccion;

DO $$
DECLARE
    v_estadio RECORD;
    v_sector RECORD;
BEGIN
    FOR v_estadio IN SELECT id_estadio FROM estadio LOOP
        FOR v_sector IN
            SELECT *
            FROM (VALUES
                (1, 'A', 6000, 180.00),
                (2, 'B', 8500, 130.00),
                (3, 'C', 10000, 95.00),
                (4, 'D', 12000, 70.00)
            ) AS s(id_sector, nombre, capacidad_max, costo_entrada)
        LOOP
            EXECUTE format(
                'INSERT INTO sector (id_sector, id_estadio, nombre, capacidad_max, costo_entrada)
                 VALUES (%s, %s, %L, %s, %s)
                 ON CONFLICT (id_sector, id_estadio) DO UPDATE
                 SET nombre = EXCLUDED.nombre,
                     capacidad_max = EXCLUDED.capacidad_max,
                     costo_entrada = EXCLUDED.costo_entrada',
                v_sector.id_sector,
                v_estadio.id_estadio,
                v_sector.nombre,
                v_sector.capacidad_max,
                v_sector.costo_entrada
            );
        END LOOP;
    END LOOP;
END $$;

INSERT INTO equipo (id_equipo, nombre, pais, grupo_mundial, fase) VALUES
(1, 'Uruguay', 'Uruguay', 'A', 'grupos'),
(2, 'Argentina', 'Argentina', 'A', 'grupos'),
(3, 'Estados Unidos', 'Estados Unidos', 'B', 'grupos'),
(4, 'Mexico', 'Mexico', 'B', 'grupos'),
(5, 'Canada', 'Canada', 'C', 'grupos'),
(6, 'Brasil', 'Brasil', 'C', 'grupos'),
(7, 'Espana', 'Espana', 'D', 'grupos'),
(8, 'Japon', 'Japon', 'D', 'grupos')
ON CONFLICT (id_equipo) DO UPDATE
SET nombre = EXCLUDED.nombre, pais = EXCLUDED.pais, grupo_mundial = EXCLUDED.grupo_mundial, fase = EXCLUDED.fase;

INSERT INTO usuario (mail, doc_pais, doc_tipo, doc_nro, dir_pais, dir_ciudad, dir_calle, password_hash) VALUES
('admin.usa@mundial2026.com', 'USA', 'PASAPORTE', 'A1001', 'Estados Unidos', 'New York', 'Main St 100', crypt('Admin123!', gen_salt('bf'))),
('func001@mundial2026.com', 'USA', 'PASAPORTE', 'F1001', 'Estados Unidos', 'New Jersey', 'Gate Ave 10', crypt('Func123!', gen_salt('bf'))),
('seba.cuneo@ucu.edu.uy', 'URY', 'CI', '50000001', 'Uruguay', 'Montevideo', 'Av. 18 de Julio 1824', crypt('Seba123!', gen_salt('bf'))),
('usuario.test@test.com', 'URY', 'CI', '50000002', 'Uruguay', 'Montevideo', 'Bulevar Artigas 1000', crypt('Test123!', gen_salt('bf')))
ON CONFLICT (mail) DO UPDATE
SET doc_pais = EXCLUDED.doc_pais,
    doc_tipo = EXCLUDED.doc_tipo,
    doc_nro = EXCLUDED.doc_nro,
    dir_pais = EXCLUDED.dir_pais,
    dir_ciudad = EXCLUDED.dir_ciudad,
    dir_calle = EXCLUDED.dir_calle,
    password_hash = EXCLUDED.password_hash;

INSERT INTO usuario_telefono (mail, telefono) VALUES
('admin.usa@mundial2026.com', '+12025550100'),
('func001@mundial2026.com', '+12025550101'),
('seba.cuneo@ucu.edu.uy', '+59899111222'),
('usuario.test@test.com', '+59899333444')
ON CONFLICT (mail, telefono) DO NOTHING;

INSERT INTO administrador (mail, fecha_asignacion, id_pais_gestionado) VALUES
('admin.usa@mundial2026.com', CURRENT_DATE, 1)
ON CONFLICT (mail) DO UPDATE
SET fecha_asignacion = EXCLUDED.fecha_asignacion,
    id_pais_gestionado = EXCLUDED.id_pais_gestionado;

INSERT INTO admin_pais (mail_admin, id_pais) VALUES
('admin.usa@mundial2026.com', 1),
('admin.usa@mundial2026.com', 2)
ON CONFLICT (mail_admin, id_pais) DO NOTHING;

INSERT INTO funcionario (mail, nro_legajo) VALUES
('func001@mundial2026.com', 'LEG-001')
ON CONFLICT (mail) DO UPDATE SET nro_legajo = EXCLUDED.nro_legajo;

INSERT INTO usuario_general (mail, fecha_registro, estado_verif) VALUES
('seba.cuneo@ucu.edu.uy', now(), 'verificado'),
('usuario.test@test.com', now(), 'verificado')
ON CONFLICT (mail) DO UPDATE
SET estado_verif = EXCLUDED.estado_verif;

INSERT INTO comision_historico (id_comision, porcentaje, fecha_inicio, fecha_fin) VALUES
(1, 10.00, '2026-01-01 00:00:00+00', NULL)
ON CONFLICT (id_comision) DO UPDATE
SET porcentaje = EXCLUDED.porcentaje,
    fecha_inicio = EXCLUDED.fecha_inicio,
    fecha_fin = EXCLUDED.fecha_fin;

INSERT INTO evento (id_evento, id_estadio, mail_admin, fecha_hora, estado, id_equipo_local, id_equipo_visit) VALUES
(1, 1, 'admin.usa@mundial2026.com', '2026-07-10 21:00:00+00', 'programado', 1, 2),
(2, 2, 'admin.usa@mundial2026.com', '2026-07-12 23:00:00+00', 'programado', 3, 4),
(3, 1, 'admin.usa@mundial2026.com', '2026-07-15 20:00:00+00', 'programado', 6, 7)
ON CONFLICT (id_evento) DO UPDATE
SET id_estadio = EXCLUDED.id_estadio,
    mail_admin = EXCLUDED.mail_admin,
    fecha_hora = EXCLUDED.fecha_hora,
    estado = EXCLUDED.estado,
    id_equipo_local = EXCLUDED.id_equipo_local,
    id_equipo_visit = EXCLUDED.id_equipo_visit;

INSERT INTO evento_sector (id_evento, id_sector, id_estadio, cupo_maximo, entradas_emitidas)
SELECT ev.id_evento, s.id_sector, ev.id_estadio, LEAST(s.capacidad_max, 1000), 0
FROM evento ev
JOIN sector s ON s.id_estadio = ev.id_estadio
WHERE ev.id_evento IN (1, 2, 3)
ON CONFLICT (id_evento, id_sector, id_estadio) DO UPDATE
SET cupo_maximo = EXCLUDED.cupo_maximo;

INSERT INTO dispositivo (id_dispositivo, mail_funcionario, descripcion, activo) VALUES
(1, 'func001@mundial2026.com', 'Tablet puerta A - MetLife', TRUE)
ON CONFLICT (id_dispositivo) DO UPDATE
SET mail_funcionario = EXCLUDED.mail_funcionario,
    descripcion = EXCLUDED.descripcion,
    activo = EXCLUDED.activo;

INSERT INTO func_sector_evento (mail_func, id_evento, id_sector, id_estadio)
SELECT 'func001@mundial2026.com', es.id_evento, es.id_sector, es.id_estadio
FROM evento_sector es
WHERE es.id_evento IN (1, 2, 3)
ON CONFLICT (mail_func, id_evento, id_sector, id_estadio) DO NOTHING;

INSERT INTO venta (id_venta, mail_usuario, id_comision, fecha, estado, monto_total, comision_pct)
SELECT 1, 'seba.cuneo@ucu.edu.uy', 1, now(), 'pagada', 198.00, 10.00
WHERE NOT EXISTS (SELECT 1 FROM venta WHERE id_venta = 1);

INSERT INTO entrada (id_entrada, id_venta, id_evento, id_sector, id_estadio, mail_propietario, estado, transferencias_rest)
SELECT 1, 1, 1, 1, 1, 'seba.cuneo@ucu.edu.uy', 'disponible', 3
WHERE NOT EXISTS (SELECT 1 FROM entrada WHERE id_entrada = 1);

SELECT setval(pg_get_serial_sequence('estadio', 'id_estadio'), COALESCE((SELECT MAX(id_estadio) FROM estadio), 1), TRUE);
SELECT setval(pg_get_serial_sequence('equipo', 'id_equipo'), COALESCE((SELECT MAX(id_equipo) FROM equipo), 1), TRUE);
SELECT setval(pg_get_serial_sequence('comision_historico', 'id_comision'), COALESCE((SELECT MAX(id_comision) FROM comision_historico), 1), TRUE);
SELECT setval(pg_get_serial_sequence('evento', 'id_evento'), COALESCE((SELECT MAX(id_evento) FROM evento), 1), TRUE);
SELECT setval(pg_get_serial_sequence('dispositivo', 'id_dispositivo'), COALESCE((SELECT MAX(id_dispositivo) FROM dispositivo), 1), TRUE);
SELECT setval(pg_get_serial_sequence('venta', 'id_venta'), COALESCE((SELECT MAX(id_venta) FROM venta), 1), TRUE);
SELECT setval(pg_get_serial_sequence('entrada', 'id_entrada'), COALESCE((SELECT MAX(id_entrada) FROM entrada), 1), TRUE);
