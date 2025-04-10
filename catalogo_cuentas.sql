-- Script SQL para cargar el Catálogo de Cuentas
-- Contadom - Sistema de Contabilidad

-- Función para generar UUIDs
CREATE OR REPLACE FUNCTION generate_uuid() RETURNS uuid AS $$
BEGIN
    RETURN uuid_generate_v4();
END;
$$ LANGUAGE plpgsql;

-- Verificar si existe la extensión uuid-ossp
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
END $$;

-- Variable para el usuario que crea las cuentas (actualizar con UUID válido)
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- Obtener el ID del primer usuario administrador o usar un valor predeterminado
    SELECT id INTO admin_user_id FROM public.user_profiles 
    WHERE role = 'admin' 
    LIMIT 1;
    
    IF admin_user_id IS NULL THEN
        admin_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    -- =====================================================================
    -- ACTIVOS (1000)
    -- =====================================================================
    
    -- Cuenta padre: Activos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '1000', 'ACTIVOS', 'Activos totales de la empresa', 
        'activo', 'deudora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Activos
    WITH activos AS (SELECT id FROM public.accounts WHERE code = '1000')
    
    -- Subcuentas de Activos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1100', 'ACTIVO CORRIENTE', 'Activos realizables en menos de un año', 
        'activo', 'deudora', true, true, 
        (SELECT id FROM activos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Activo Corriente
    WITH activo_corriente AS (SELECT id FROM public.accounts WHERE code = '1100')
    
    -- Subcuentas de Activo Corriente
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1110', 'EFECTIVO Y EQUIVALENTES', 'Efectivo y equivalentes de efectivo', 
        'activo', 'deudora', true, true, 
        (SELECT id FROM activo_corriente), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta EFECTIVO Y EQUIVALENTES
    WITH efectivo AS (SELECT id FROM public.accounts WHERE code = '1110')
    
    -- Subcuentas de EFECTIVO Y EQUIVALENTES
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1111', 'Caja General', 'Caja general para operaciones en efectivo', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM efectivo), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '1112', 'Caja Chica', 'Fondo fijo para gastos menores', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM efectivo), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '1113', 'Bancos', 'Depósitos en cuentas bancarias', 
        'activo', 'deudora', true, true, 
        (SELECT id FROM efectivo), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta Bancos
    WITH bancos AS (SELECT id FROM public.accounts WHERE code = '1113')
    
    -- Subcuentas de Bancos (ejemplos)
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1113.01', 'Banco Nacional Cuenta Corriente', 'Cuenta corriente principal', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM bancos), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '1113.02', 'Banco Nacional Cuenta Ahorro', 'Cuenta de ahorros', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM bancos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Más subcuentas de Activo Corriente
    WITH activo_corriente AS (SELECT id FROM public.accounts WHERE code = '1100')
    
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1120', 'CUENTAS POR COBRAR', 'Derechos de cobro a terceros', 
        'activo', 'deudora', true, true, 
        (SELECT id FROM activo_corriente), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a CUENTAS POR COBRAR
    WITH cxc AS (SELECT id FROM public.accounts WHERE code = '1120')
    
    -- Subcuentas de CUENTAS POR COBRAR
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '1121', 'Clientes', 'Cuentas por cobrar a clientes', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM cxc), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '1122', 'Empleados', 'Préstamos y anticipos a empleados', 
        'activo', 'deudora', true, false, 
        (SELECT id FROM cxc), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '1123', 'Provisión para cuentas incobrables', 'Estimación de cuentas incobrables', 
        'activo', 'acreedora', true, false, 
        (SELECT id FROM cxc), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- =====================================================================
    -- PASIVOS (2000)
    -- =====================================================================
    
    -- Cuenta padre: Pasivos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '2000', 'PASIVOS', 'Obligaciones totales de la empresa', 
        'pasivo', 'acreedora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Pasivos
    WITH pasivos AS (SELECT id FROM public.accounts WHERE code = '2000')
    
    -- Subcuentas de Pasivos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '2100', 'PASIVO CORRIENTE', 'Obligaciones pagaderas en menos de un año', 
        'pasivo', 'acreedora', true, true, 
        (SELECT id FROM pasivos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Pasivo Corriente
    WITH pasivo_corriente AS (SELECT id FROM public.accounts WHERE code = '2100')
    
    -- Subcuentas de Pasivo Corriente
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '2110', 'CUENTAS POR PAGAR', 'Obligaciones de pago a terceros', 
        'pasivo', 'acreedora', true, true, 
        (SELECT id FROM pasivo_corriente), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a CUENTAS POR PAGAR
    WITH cxp AS (SELECT id FROM public.accounts WHERE code = '2110')
    
    -- Subcuentas de CUENTAS POR PAGAR
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '2111', 'Proveedores', 'Cuentas por pagar a proveedores', 
        'pasivo', 'acreedora', true, false, 
        (SELECT id FROM cxp), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '2112', 'Impuestos por pagar', 'Impuestos pendientes de pago', 
        'pasivo', 'acreedora', true, false, 
        (SELECT id FROM cxp), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- =====================================================================
    -- PATRIMONIO (3000)
    -- =====================================================================
    
    -- Cuenta padre: Patrimonio
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '3000', 'PATRIMONIO', 'Capital y resultados acumulados', 
        'patrimonio', 'acreedora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Patrimonio
    WITH patrimonio AS (SELECT id FROM public.accounts WHERE code = '3000')
    
    -- Subcuentas de Patrimonio
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '3100', 'CAPITAL', 'Aportaciones de los socios', 
        'patrimonio', 'acreedora', true, false, 
        (SELECT id FROM patrimonio), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '3200', 'RESULTADOS ACUMULADOS', 'Utilidades o pérdidas acumuladas', 
        'patrimonio', 'acreedora', true, true, 
        (SELECT id FROM patrimonio), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a RESULTADOS ACUMULADOS
    WITH resultados AS (SELECT id FROM public.accounts WHERE code = '3200')
    
    -- Subcuentas de RESULTADOS ACUMULADOS
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '3210', 'Utilidad del ejercicio', 'Resultado del período actual', 
        'patrimonio', 'acreedora', true, false, 
        (SELECT id FROM resultados), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '3220', 'Utilidades acumuladas', 'Resultados de períodos anteriores', 
        'patrimonio', 'acreedora', true, false, 
        (SELECT id FROM resultados), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- =====================================================================
    -- INGRESOS (4000)
    -- =====================================================================
    
    -- Cuenta padre: Ingresos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '4000', 'INGRESOS', 'Ingresos operativos y no operativos', 
        'ingreso', 'acreedora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Ingresos
    WITH ingresos AS (SELECT id FROM public.accounts WHERE code = '4000')
    
    -- Subcuentas de Ingresos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '4100', 'INGRESOS OPERATIVOS', 'Ingresos por actividades normales', 
        'ingreso', 'acreedora', true, true, 
        (SELECT id FROM ingresos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a INGRESOS OPERATIVOS
    WITH ing_op AS (SELECT id FROM public.accounts WHERE code = '4100')
    
    -- Subcuentas de INGRESOS OPERATIVOS
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '4110', 'Ventas', 'Ingresos por venta de productos o servicios', 
        'ingreso', 'acreedora', true, false, 
        (SELECT id FROM ing_op), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- =====================================================================
    -- COSTOS (5000)
    -- =====================================================================
    
    -- Cuenta padre: Costos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '5000', 'COSTOS', 'Costos asociados a la operación', 
        'costo', 'deudora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Costos
    WITH costos AS (SELECT id FROM public.accounts WHERE code = '5000')
    
    -- Subcuentas de Costos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '5100', 'COSTO DE VENTAS', 'Costo directo de los productos vendidos', 
        'costo', 'deudora', true, false, 
        (SELECT id FROM costos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- =====================================================================
    -- GASTOS (6000)
    -- =====================================================================
    
    -- Cuenta padre: Gastos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES (
        uuid_generate_v4(), '6000', 'GASTOS', 'Gastos operativos y no operativos', 
        'gasto', 'deudora', true, true, NULL, 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a la cuenta padre Gastos
    WITH gastos AS (SELECT id FROM public.accounts WHERE code = '6000')
    
    -- Subcuentas de Gastos
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '6100', 'GASTOS ADMINISTRATIVOS', 'Gastos de administración', 
        'gasto', 'deudora', true, true, 
        (SELECT id FROM gastos), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '6200', 'GASTOS DE VENTAS', 'Gastos relacionados con ventas', 
        'gasto', 'deudora', true, true, 
        (SELECT id FROM gastos), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '6300', 'GASTOS FINANCIEROS', 'Gastos de intereses y financieros', 
        'gasto', 'deudora', true, true, 
        (SELECT id FROM gastos), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a GASTOS ADMINISTRATIVOS
    WITH gastos_adm AS (SELECT id FROM public.accounts WHERE code = '6100')
    
    -- Subcuentas de GASTOS ADMINISTRATIVOS
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '6110', 'Sueldos y salarios', 'Pago de nómina', 
        'gasto', 'deudora', true, false, 
        (SELECT id FROM gastos_adm), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '6120', 'Alquileres', 'Arrendamiento de oficinas y equipos', 
        'gasto', 'deudora', true, false, 
        (SELECT id FROM gastos_adm), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '6130', 'Servicios públicos', 'Agua, electricidad, internet', 
        'gasto', 'deudora', true, false, 
        (SELECT id FROM gastos_adm), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
    -- Obtener referencia a GASTOS FINANCIEROS
    WITH gastos_fin AS (SELECT id FROM public.accounts WHERE code = '6300')
    
    -- Subcuentas de GASTOS FINANCIEROS
    INSERT INTO public.accounts (
        id, code, name, description, type, nature, is_active, is_parent, 
        parent_id, created_by, created_at, updated_at
    ) VALUES 
    (
        uuid_generate_v4(), '6310', 'Intereses bancarios', 'Intereses de préstamos', 
        'gasto', 'deudora', true, false, 
        (SELECT id FROM gastos_fin), 
        admin_user_id, NOW(), NOW()
    ),
    (
        uuid_generate_v4(), '6320', 'Comisiones bancarias', 'Comisiones por servicios bancarios', 
        'gasto', 'deudora', true, false, 
        (SELECT id FROM gastos_fin), 
        admin_user_id, NOW(), NOW()
    ) ON CONFLICT (code) DO NOTHING;
    
END $$;

-- Mensaje de confirmación
SELECT 'Catálogo de cuentas cargado exitosamente' AS resultado; 