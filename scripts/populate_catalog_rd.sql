-- Script para poblar la base de datos con catálogo de cuentas estándar de República Dominicana

-- Variables para el ID del administrador
DO $$
DECLARE
    admin_id UUID;
    user_found BOOLEAN;
BEGIN
    -- Buscar cualquier usuario disponible en user_profiles
    SELECT EXISTS(SELECT 1 FROM user_profiles) INTO user_found;
    
    IF NOT user_found THEN
        RAISE EXCEPTION 'No hay usuarios en la tabla user_profiles. Por favor, cree un usuario a través de la interfaz o panel de Supabase antes de ejecutar este script.';
    END IF;
    
    -- Obtener un ID de usuario disponible (preferiblemente un admin)
    SELECT id INTO admin_id FROM user_profiles WHERE role = 'admin' LIMIT 1;
    
    -- Si no hay admin, usar cualquier usuario
    IF admin_id IS NULL THEN
        SELECT id INTO admin_id FROM user_profiles LIMIT 1;
    END IF;
    
    RAISE NOTICE 'Utilizando el ID de usuario: %', admin_id;

    -- Crear categorías de cuentas
    INSERT INTO account_categories (id, code, name, description, created_at, created_by, updated_at)
    VALUES
    ('22222222-2222-2222-2222-222222222201', '1', 'Activos', 'Recursos controlados por la entidad', NOW(), admin_id, NOW()),
    ('22222222-2222-2222-2222-222222222202', '2', 'Pasivos', 'Obligaciones presentes de la entidad', NOW(), admin_id, NOW()),
    ('22222222-2222-2222-2222-222222222203', '3', 'Capital', 'Parte residual de los activos menos los pasivos', NOW(), admin_id, NOW()),
    ('22222222-2222-2222-2222-222222222204', '4', 'Ingresos', 'Incrementos en los beneficios económicos', NOW(), admin_id, NOW()),
    ('22222222-2222-2222-2222-222222222205', '5', 'Costos y Gastos', 'Decrementos en los beneficios económicos', NOW(), admin_id, NOW()),
    ('22222222-2222-2222-2222-222222222206', '6', 'Cuentas de Orden', 'Cuentas de control para fines específicos', NOW(), admin_id, NOW());

    -- ACTIVOS
    -- Crear cuentas principales de Activos
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    -- Activos Corrientes
    ('a1000000-0000-4000-a000-000000000001'::UUID, '1000000', 'ACTIVOS', 'Recursos controlados por la entidad', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, NULL);
    
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1100000-0000-4000-a000-000000000002'::UUID, '1100000', 'ACTIVOS CORRIENTES', 'Activos que se esperan realizar en un ciclo normal de operación', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1000000-0000-4000-a000-000000000001'::UUID);
    
    -- Efectivo y Equivalentes
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1110000-0000-4000-a000-000000000003'::UUID, '1110000', 'EFECTIVO Y EQUIVALENTES', 'Dinero disponible y de inmediata disposición', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1100000-0000-4000-a000-000000000002'::UUID);
    
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1110100-0000-4000-a000-000000000004'::UUID, '1110100', 'Caja General', 'Efectivo disponible físicamente', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1110000-0000-4000-a000-000000000003'::UUID);
    
    -- Cuentas por Cobrar
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1120000-0000-4000-a000-000000000012'::UUID, '1120000', 'CUENTAS POR COBRAR', 'Derechos de cobro a terceros', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1100000-0000-4000-a000-000000000002'::UUID),
    ('a1120100-0000-4000-a000-000000000013'::UUID, '1120100', 'Clientes Locales', 'Cuentas por cobrar a clientes nacionales', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID),
    ('a1120200-0000-4000-a000-000000000014'::UUID, '1120200', 'Clientes del Exterior', 'Cuentas por cobrar a clientes extranjeros', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID),
    ('a1120300-0000-4000-a000-000000000015'::UUID, '1120300', 'Cuentas por Cobrar Empleados', 'Préstamos y anticipos a empleados', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID),
    ('a1120400-0000-4000-a000-000000000016'::UUID, '1120400', 'Anticipos a Proveedores', 'Pagos anticipados a proveedores', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID),
    ('a1120500-0000-4000-a000-000000000017'::UUID, '1120500', 'Otras Cuentas por Cobrar', 'Otros derechos de cobro', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID),
    ('a1120600-0000-4000-a000-000000000018'::UUID, '1120600', 'Provisión para Cuentas Incobrables', 'Estimación de cuentas incobrables', true, NOW(), admin_id, NOW(), 'acreedora', 'activo', false, 'a1120000-0000-4000-a000-000000000012'::UUID);
    
    -- Inventarios
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1130000-0000-4000-a000-000000000019'::UUID, '1130000', 'INVENTARIOS', 'Bienes destinados a la venta o producción', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1100000-0000-4000-a000-000000000002'::UUID),
    ('a1130100-0000-4000-a000-000000000020'::UUID, '1130100', 'Mercancías para la Venta', 'Productos terminados para comercialización', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID),
    ('a1130200-0000-4000-a000-000000000021'::UUID, '1130200', 'Materia Prima', 'Materiales para producción', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID),
    ('a1130300-0000-4000-a000-000000000022'::UUID, '1130300', 'Productos en Proceso', 'Productos en fabricación', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID),
    ('a1130400-0000-4000-a000-000000000023'::UUID, '1130400', 'Productos Terminados', 'Productos fabricados listos para venta', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID),
    ('a1130500-0000-4000-a000-000000000024'::UUID, '1130500', 'Materiales y Suministros', 'Materiales para uso administrativo', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID),
    ('a1130600-0000-4000-a000-000000000025'::UUID, '1130600', 'Provisión por Obsolescencia', 'Estimación de inventario obsoleto', true, NOW(), admin_id, NOW(), 'acreedora', 'activo', false, 'a1130000-0000-4000-a000-000000000019'::UUID);
    
    -- Impuestos
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1140000-0000-4000-a000-000000000026'::UUID, '1140000', 'IMPUESTOS', 'Créditos fiscales y anticipos de impuestos', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1100000-0000-4000-a000-000000000002'::UUID),
    ('a1140100-0000-4000-a000-000000000027'::UUID, '1140100', 'ITBIS Pagado', 'Impuesto sobre Transferencias de Bienes pagado', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1140000-0000-4000-a000-000000000026'::UUID),
    ('a1140200-0000-4000-a000-000000000028'::UUID, '1140200', 'ISR Pagado por Anticipado', 'Anticipos de Impuesto Sobre la Renta', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1140000-0000-4000-a000-000000000026'::UUID),
    ('a1140300-0000-4000-a000-000000000029'::UUID, '1140300', 'Retenciones ISR', 'Retenciones de ISR efectuadas', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1140000-0000-4000-a000-000000000026'::UUID);
    
    -- Gastos Pagados por Anticipado
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1150000-0000-4000-a000-000000000030'::UUID, '1150000', 'GASTOS PAGADOS POR ANTICIPADO', 'Pagos anticipados de gastos futuros', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1100000-0000-4000-a000-000000000002'::UUID),
    ('a1150100-0000-4000-a000-000000000031'::UUID, '1150100', 'Seguros Pagados por Anticipado', 'Primas de seguros pagadas por adelantado', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1150000-0000-4000-a000-000000000030'::UUID),
    ('a1150200-0000-4000-a000-000000000032'::UUID, '1150200', 'Alquileres Pagados por Anticipado', 'Alquileres pagados por adelantado', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1150000-0000-4000-a000-000000000030'::UUID),
    ('a1150300-0000-4000-a000-000000000033'::UUID, '1150300', 'Publicidad Pagada por Anticipado', 'Publicidad pagada por adelantado', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1150000-0000-4000-a000-000000000030'::UUID);
    
    -- Activos No Corrientes
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1200000-0000-4000-a000-000000000034'::UUID, '1200000', 'ACTIVOS NO CORRIENTES', 'Activos de largo plazo', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1000000-0000-4000-a000-000000000001'::UUID);
    
    -- Propiedad, Planta y Equipo
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1210000-0000-4000-a000-000000000035'::UUID, '1210000', 'PROPIEDAD, PLANTA Y EQUIPO', 'Activos fijos tangibles', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1200000-0000-4000-a000-000000000034'::UUID),
    ('a1210100-0000-4000-a000-000000000036'::UUID, '1210100', 'Terrenos', 'Terrenos propiedad de la empresa', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210200-0000-4000-a000-000000000037'::UUID, '1210200', 'Edificios', 'Edificaciones propiedad de la empresa', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210300-0000-4000-a000-000000000038'::UUID, '1210300', 'Maquinaria y Equipo', 'Maquinaria para producción', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210400-0000-4000-a000-000000000039'::UUID, '1210400', 'Mobiliario y Equipo de Oficina', 'Mobiliario de uso administrativo', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210500-0000-4000-a000-000000000040'::UUID, '1210500', 'Equipo de Transporte', 'Vehículos de la empresa', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210600-0000-4000-a000-000000000041'::UUID, '1210600', 'Equipo de Cómputo', 'Computadoras y periféricos', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID),
    ('a1210700-0000-4000-a000-000000000042'::UUID, '1210700', 'Depreciación Acumulada', 'Depreciación acumulada de activos fijos', true, NOW(), admin_id, NOW(), 'acreedora', 'activo', false, 'a1210000-0000-4000-a000-000000000035'::UUID);
    
    -- Activos Intangibles
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1220000-0000-4000-a000-000000000043'::UUID, '1220000', 'ACTIVOS INTANGIBLES', 'Activos no físicos', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1200000-0000-4000-a000-000000000034'::UUID),
    ('a1220100-0000-4000-a000-000000000044'::UUID, '1220100', 'Marcas y Patentes', 'Derechos sobre marcas y patentes', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1220000-0000-4000-a000-000000000043'::UUID),
    ('a1220200-0000-4000-a000-000000000045'::UUID, '1220200', 'Software', 'Programas informáticos', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1220000-0000-4000-a000-000000000043'::UUID),
    ('a1220300-0000-4000-a000-000000000046'::UUID, '1220300', 'Licencias', 'Derechos de uso', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1220000-0000-4000-a000-000000000043'::UUID),
    ('a1220400-0000-4000-a000-000000000047'::UUID, '1220400', 'Amortización Acumulada', 'Amortización acumulada de intangibles', true, NOW(), admin_id, NOW(), 'acreedora', 'activo', false, 'a1220000-0000-4000-a000-000000000043'::UUID);
    
    -- Inversiones a Largo Plazo
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    ('a1230000-0000-4000-a000-000000000048'::UUID, '1230000', 'INVERSIONES A LARGO PLAZO', 'Inversiones con plazo mayor a un año', true, NOW(), admin_id, NOW(), 'deudora', 'activo', true, 'a1200000-0000-4000-a000-000000000034'::UUID),
    ('a1230100-0000-4000-a000-000000000049'::UUID, '1230100', 'Inversiones en Acciones', 'Inversiones en títulos de capital', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1230000-0000-4000-a000-000000000048'::UUID),
    ('a1230200-0000-4000-a000-000000000050'::UUID, '1230200', 'Inversiones en Bonos', 'Inversiones en títulos de deuda', true, NOW(), admin_id, NOW(), 'deudora', 'activo', false, 'a1230000-0000-4000-a000-000000000048'::UUID);

    -- PASIVOS
    INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
    VALUES
    -- Pasivos Generales
    (gen_random_uuid(), '2000000', 'PASIVOS', 'Obligaciones presentes de la entidad', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, NULL);

    -- Obtener el ID del registro recién insertado
    DECLARE
    pasivo_id UUID;
    BEGIN
        SELECT id INTO pasivo_id FROM accounts WHERE code = '2000000' LIMIT 1;
        
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2100000', 'PASIVOS CORRIENTES', 'Obligaciones a corto plazo', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivo_id);
    END;

    RAISE NOTICE 'Catálogo de cuentas básico creado exitosamente. Use gen_random_uuid() para insertar más cuentas.';

END $$;

-- Confirmar finalización
SELECT 'Catálogo inicial de cuentas de República Dominicana ha sido creado con UUIDs válidos.' AS resultado; 