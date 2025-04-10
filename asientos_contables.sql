-- Script SQL para generar asientos contables profesionales
-- Contadom - Sistema de Contabilidad
-- Periodos: Enero, Febrero, Marzo y hasta 10 de Abril de 2024

-- Función para generar UUIDs
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
    ) THEN
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    END IF;
END $$;

-- Desactivar temporalmente los triggers para la carga masiva
DO $$
BEGIN
    -- Desactivar todos los triggers de journal_entries excepto las restricciones de la base de datos
    ALTER TABLE journal_entries DISABLE TRIGGER USER;
    
    -- Alternativamente, desactivar triggers específicos si es necesario
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_journal_entry_trigger') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER check_journal_entry_trigger;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entries_permission_trigger') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER journal_entries_permission_trigger;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_journal_permissions') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER check_journal_permissions;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_approval_sync') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER journal_entry_approval_sync;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_date_validation') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER journal_entry_date_validation;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_journal_entry_trigger') THEN
        ALTER TABLE journal_entries DISABLE TRIGGER validate_journal_entry_trigger;
    END IF;
END $$;

-- ================================================================
-- FUNCIÓN PARA CREAR ASIENTOS CONTABLES
-- ================================================================

-- Crear función para generar asientos contables
CREATE OR REPLACE FUNCTION crear_asiento(
    p_fecha DATE,
    p_descripcion TEXT,
    p_periodo_id UUID,
    p_user_id UUID,
    p_es_aprobado BOOLEAN DEFAULT true,
    p_referencia TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_asiento_id UUID;
    v_numero_asiento TEXT;
    v_periodo_contable_id UUID;
BEGIN
    -- Obtener el ID del período contable anual relacionado con el período mensual
    SELECT fiscal_year_id INTO v_periodo_contable_id 
    FROM monthly_accounting_periods 
    WHERE id = p_periodo_id;
    
    -- Si no se encuentra, usar el mismo ID del período mensual como período contable
    IF v_periodo_contable_id IS NULL THEN
        v_periodo_contable_id := p_periodo_id;
    END IF;
    
    -- Generar número de asiento (formato: YYYY-MM-XXXX)
    SELECT 'JE-' || TO_CHAR(p_fecha, 'YYYY-MM') || '-' || 
           LPAD(COALESCE(
               (SELECT COUNT(*) + 1 
                FROM journal_entries 
                WHERE TO_CHAR(date, 'YYYY-MM') = TO_CHAR(p_fecha, 'YYYY-MM')),
               1)::TEXT, 4, '0')
    INTO v_numero_asiento;
    
    -- Insertar asiento
    INSERT INTO journal_entries (
        id, entry_number, date, description, monthly_period_id, accounting_period_id,
        is_posted, status, is_balanced, is_approved, is_closing_entry,
        is_opening_entry, is_adjustment, reference_number,
        created_at, created_by, updated_at,
        posted_at, posted_by, approved_at, approved_by
    )
    VALUES (
        uuid_generate_v4(), v_numero_asiento, p_fecha, p_descripcion, p_periodo_id, v_periodo_contable_id,
        p_es_aprobado, CASE WHEN p_es_aprobado THEN 'aprobado' ELSE 'pendiente' END, true, p_es_aprobado, false,
        false, false, p_referencia,
        NOW(), p_user_id, NOW(),
        CASE WHEN p_es_aprobado THEN NOW() ELSE NULL END,
        CASE WHEN p_es_aprobado THEN p_user_id ELSE NULL END,
        CASE WHEN p_es_aprobado THEN NOW() ELSE NULL END,
        CASE WHEN p_es_aprobado THEN p_user_id ELSE NULL END
    )
    RETURNING id INTO v_asiento_id;
    
    RETURN v_asiento_id;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- FUNCIÓN PARA AÑADIR LÍNEAS A LOS ASIENTOS
-- ================================================================

CREATE OR REPLACE FUNCTION agregar_linea_asiento(
    p_asiento_id UUID,
    p_cuenta_codigo TEXT,
    p_descripcion TEXT,
    p_debito NUMERIC DEFAULT 0,
    p_credito NUMERIC DEFAULT 0,
    p_user_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_cuenta_id UUID;
BEGIN
    -- Obtener ID de la cuenta por su código
    SELECT id INTO v_cuenta_id
    FROM accounts
    WHERE code = p_cuenta_codigo;
    
    IF v_cuenta_id IS NULL THEN
        RAISE EXCEPTION 'Cuenta con código % no encontrada', p_cuenta_codigo;
    END IF;
    
    -- Insertar línea de asiento
    INSERT INTO journal_entry_items (
        id, journal_entry_id, account_id, description,
        debit, credit, created_at, created_by, updated_at
    )
    VALUES (
        uuid_generate_v4(), p_asiento_id, v_cuenta_id, p_descripcion,
        p_debito, p_credito, NOW(), p_user_id, NOW()
    );
    
    -- Actualizar totales en el asiento
    UPDATE journal_entries
    SET 
        total_debit = (SELECT COALESCE(SUM(debit), 0) FROM journal_entry_items WHERE journal_entry_id = p_asiento_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM journal_entry_items WHERE journal_entry_id = p_asiento_id)
    WHERE id = p_asiento_id;
END;
$$ LANGUAGE plpgsql;

-- Crear cuentas adicionales necesarias si no existen
DO $$
DECLARE
    admin_user_id UUID;
    activo_corriente_id UUID;
    activo_no_corriente_id UUID;
    pasivo_no_corriente_id UUID;
    gastos_administrativos_id UUID;
    gastos_financieros_id UUID;
    activos_id UUID;
    pasivos_id UUID;
    anticipos_id UUID;
BEGIN
    -- Obtener el ID del primer usuario administrador
    SELECT id INTO admin_user_id FROM public.user_profiles 
    WHERE role = 'admin' 
    LIMIT 1;
    
    IF admin_user_id IS NULL THEN
        admin_user_id := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;
    
    -- Obtener IDs de cuentas padres existentes
    SELECT id INTO activo_corriente_id FROM accounts WHERE code = '1100';
    SELECT id INTO activos_id FROM accounts WHERE code = '1000';
    SELECT id INTO pasivos_id FROM accounts WHERE code = '2000';
    
    -- Crear cuenta de Activo No Corriente si no existe
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1150') THEN
        -- Verificar si existe la cuenta padre de Activos
        IF activos_id IS NOT NULL THEN
            -- Crear Activo No Corriente
            INSERT INTO accounts (
                id, code, name, description, type, nature, is_active, is_parent, 
                parent_id, created_by, created_at, updated_at
            ) VALUES (
                uuid_generate_v4(), '1150', 'ACTIVO NO CORRIENTE', 'Activos a largo plazo', 
                'activo', 'deudora', true, true, 
                activos_id, admin_user_id, NOW(), NOW()
            ) ON CONFLICT (code) DO NOTHING
            RETURNING id INTO activo_no_corriente_id;
        END IF;
    ELSE
        SELECT id INTO activo_no_corriente_id FROM accounts WHERE code = '1150';
    END IF;
    
    -- Crear Pasivo No Corriente si no existe
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2200') THEN
        -- Verificar si existe la cuenta padre de Pasivos
        IF pasivos_id IS NOT NULL THEN
            -- Crear Pasivo No Corriente
            INSERT INTO accounts (
                id, code, name, description, type, nature, is_active, is_parent, 
                parent_id, created_by, created_at, updated_at
            ) VALUES (
                uuid_generate_v4(), '2200', 'PASIVO NO CORRIENTE', 'Obligaciones a largo plazo', 
                'pasivo', 'acreedora', true, true, 
                pasivos_id, admin_user_id, NOW(), NOW()
            ) ON CONFLICT (code) DO NOTHING
            RETURNING id INTO pasivo_no_corriente_id;
        END IF;
    ELSE
        SELECT id INTO pasivo_no_corriente_id FROM accounts WHERE code = '2200';
    END IF;
    
    -- Verificar y obtener Gastos Administrativos ID
    SELECT id INTO gastos_administrativos_id FROM accounts WHERE code = '6100';
    
    -- Verificar y obtener Gastos Financieros ID
    SELECT id INTO gastos_financieros_id FROM accounts WHERE code = '6300';
    
    -- Crear cuenta padre para Gastos Anticipados si no existe
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '1130') THEN
        -- Verificar si existe la cuenta padre de Activo Corriente
        IF activo_corriente_id IS NOT NULL THEN
            -- Crear cuenta de Gastos Anticipados
            INSERT INTO accounts (
                id, code, name, description, type, nature, is_active, is_parent, 
                parent_id, created_by, created_at, updated_at
            ) VALUES (
                uuid_generate_v4(), '1130', 'GASTOS ANTICIPADOS', 'Gastos pagados por adelantado', 
                'activo', 'deudora', true, true, 
                activo_corriente_id, admin_user_id, NOW(), NOW()
            ) ON CONFLICT (code) DO NOTHING
            RETURNING id INTO anticipos_id;
        END IF;
    ELSE
        SELECT id INTO anticipos_id FROM accounts WHERE code = '1130';
    END IF;
    
    -- Crear cuentas adicionales para los asientos
    
    -- Activos Corrientes Adicionales (bajo 1100)
    IF activo_corriente_id IS NOT NULL THEN
        -- Gastos Anticipados
        INSERT INTO accounts (
            id, code, name, description, type, nature, is_active, is_parent, 
            parent_id, created_by, created_at, updated_at
        ) VALUES 
        (
            uuid_generate_v4(), '1131', 'SEGUROS PAGADOS POR ANTICIPADO', 'Seguros pagados por adelantado', 
            'activo', 'deudora', true, false, 
            anticipos_id, admin_user_id, NOW(), NOW()
        ),
        (
            uuid_generate_v4(), '1132', 'PUBLICIDAD PAGADA POR ANTICIPADO', 'Gastos de publicidad pagados por adelantado', 
            'activo', 'deudora', true, false, 
            anticipos_id, admin_user_id, NOW(), NOW()
        ) ON CONFLICT (code) DO NOTHING;
    END IF;
    
    -- Activos No Corrientes (bajo 1150)
    IF activo_no_corriente_id IS NOT NULL THEN
        INSERT INTO accounts (
            id, code, name, description, type, nature, is_active, is_parent, 
            parent_id, created_by, created_at, updated_at
        ) VALUES 
        (
            uuid_generate_v4(), '1160', 'MOBILIARIO Y EQUIPO', 'Mobiliario y equipos de oficina', 
            'activo', 'deudora', true, false, 
            activo_no_corriente_id, admin_user_id, NOW(), NOW()
        ),
        (
            uuid_generate_v4(), '1170', 'EQUIPO DE CÓMPUTO', 'Equipos informáticos', 
            'activo', 'deudora', true, false, 
            activo_no_corriente_id, admin_user_id, NOW(), NOW()
        ) ON CONFLICT (code) DO NOTHING;
    END IF;
    
    -- Pasivos No Corrientes (bajo 2200)
    IF pasivo_no_corriente_id IS NOT NULL THEN
        INSERT INTO accounts (
            id, code, name, description, type, nature, is_active, is_parent, 
            parent_id, created_by, created_at, updated_at
        ) VALUES 
        (
            uuid_generate_v4(), '2210', 'PRÉSTAMOS BANCARIOS A LARGO PLAZO', 'Préstamos con vencimiento mayor a un año', 
            'pasivo', 'acreedora', true, false, 
            pasivo_no_corriente_id, admin_user_id, NOW(), NOW()
        ) ON CONFLICT (code) DO NOTHING;
    END IF;
    
    -- Gastos Administrativos Adicionales (bajo 6100)
    IF gastos_administrativos_id IS NOT NULL THEN
        INSERT INTO accounts (
            id, code, name, description, type, nature, is_active, is_parent, 
            parent_id, created_by, created_at, updated_at
        ) VALUES 
        (
            uuid_generate_v4(), '6140', 'SUMINISTROS DE OFICINA', 'Gastos en materiales de oficina', 
            'gasto', 'deudora', true, false, 
            gastos_administrativos_id, admin_user_id, NOW(), NOW()
        ),
        (
            uuid_generate_v4(), '6150', 'IMPUESTOS Y CONTRIBUCIONES', 'Pagos de impuestos y contribuciones', 
            'gasto', 'deudora', true, false, 
            gastos_administrativos_id, admin_user_id, NOW(), NOW()
        ) ON CONFLICT (code) DO NOTHING;
    END IF;
END $$;

-- Crear los periodos contables si no existen
DO $$
DECLARE
    admin_user_id UUID := 'c1c210ea-5e83-4095-af4a-35009c9701a3'::UUID; -- ID específico de un usuario con rol admin
    periodo_anual_id UUID;
    periodo_enero_id UUID;
    periodo_febrero_id UUID;
    periodo_marzo_id UUID;
    periodo_abril_id UUID;
    asiento_id UUID;
BEGIN
    -- Asegurarnos que el ID del usuario sea válido
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = admin_user_id AND role IN ('admin', 'accountant')) THEN
        RAISE EXCEPTION 'El ID del usuario administrador no es válido o no tiene los permisos necesarios';
    END IF;
    
    -- Crear periodo anual 2024 si no existe
    IF NOT EXISTS (SELECT 1 FROM public.accounting_periods WHERE name = 'Año Fiscal 2024') THEN
        INSERT INTO public.accounting_periods (
            id, name, start_date, end_date, period_type, 
            fiscal_year_type, is_month, is_closed, is_active,
            created_at, created_by, updated_at
        ) 
        VALUES (
            uuid_generate_v4(), 'Año Fiscal 2024', '2024-01-01', '2024-12-31', 'yearly',
            'calendar', false, false, true,
            NOW(), admin_user_id, NOW()
        )
        RETURNING id INTO periodo_anual_id;
    ELSE
        SELECT id INTO periodo_anual_id 
        FROM public.accounting_periods 
        WHERE name = 'Año Fiscal 2024';
    END IF;
    
    -- Crear periodos mensuales
    -- Enero 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Enero 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Enero 2024', '2024-01-01', '2024-01-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 1, 2024
        )
        RETURNING id INTO periodo_enero_id;
    ELSE
        SELECT id INTO periodo_enero_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Enero 2024';
    END IF;
    
    -- Febrero 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Febrero 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Febrero 2024', '2024-02-01', '2024-02-29', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 2, 2024
        )
        RETURNING id INTO periodo_febrero_id;
    ELSE
        SELECT id INTO periodo_febrero_id
        FROM public.monthly_accounting_periods 
        WHERE name = 'Febrero 2024';
    END IF;
    
    -- Marzo 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Marzo 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Marzo 2024', '2024-03-01', '2024-03-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 3, 2024
        )
        RETURNING id INTO periodo_marzo_id;
    ELSE
        SELECT id INTO periodo_marzo_id
        FROM public.monthly_accounting_periods 
        WHERE name = 'Marzo 2024';
    END IF;
    
    -- Abril 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Abril 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Abril 2024', '2024-04-01', '2024-04-30', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 4, 2024
        )
        RETURNING id INTO periodo_abril_id;
    ELSE
        SELECT id INTO periodo_abril_id
        FROM public.monthly_accounting_periods 
        WHERE name = 'Abril 2024';
    END IF;

    -- ================================================================
    -- ENERO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 05 Enero: Depósito inicial en banco
    asiento_id := crear_asiento('2024-01-05', 'Depósito inicial para operaciones', periodo_enero_id, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Depósito inicial en cuenta bancaria', 100000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '3100', 'Capital inicial aportado', 0, 100000, admin_user_id);
    
    -- 10 Enero: Compra de mobiliario de oficina
    asiento_id := crear_asiento('2024-01-10', 'Compra de mobiliario para oficina', periodo_enero_id, admin_user_id, true, 'FACT-2024-001');
    PERFORM agregar_linea_asiento(asiento_id, '1160', 'Mobiliario y equipo de oficina', 15000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 15000, admin_user_id);
    
    -- 15 Enero: Pago de alquiler
    asiento_id := crear_asiento('2024-01-15', 'Pago de alquiler mensual', periodo_enero_id, admin_user_id, true, 'REC-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina enero', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Enero: Venta de servicios
    asiento_id := crear_asiento('2024-01-20', 'Venta de servicios de consultoría', periodo_enero_id, admin_user_id, true, 'FACT-V-2024-001');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 25000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 25000, admin_user_id);
    
    -- 25 Enero: Pago de servicios públicos
    asiento_id := crear_asiento('2024-01-25', 'Pago de servicios públicos', periodo_enero_id, admin_user_id, true, 'FACT-SERV-2024-01');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1200, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1200, admin_user_id);
    
    -- 31 Enero: Pago de nómina
    asiento_id := crear_asiento('2024-01-31', 'Pago de nómina mensual', periodo_enero_id, admin_user_id, true, 'NOM-2024-01');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 18000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 18000, admin_user_id);

    -- ================================================================
    -- FEBRERO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 05 Febrero: Compra de suministros
    asiento_id := crear_asiento('2024-02-05', 'Compra de suministros de oficina', periodo_febrero_id, admin_user_id, true, 'FACT-2024-025');
    PERFORM agregar_linea_asiento(asiento_id, '6140', 'Suministros de oficina', 2500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2500, admin_user_id);
    
    -- 10 Febrero: Pago de Internet y telefonía
    asiento_id := crear_asiento('2024-02-10', 'Servicio de Internet y telefonía', periodo_febrero_id, admin_user_id, true, 'FACT-INT-2024-02');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Servicio de Internet y telefonía', 1800, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1800, admin_user_id);
    
    -- 15 Febrero: Pago de alquiler
    asiento_id := crear_asiento('2024-02-15', 'Pago de alquiler mensual', periodo_febrero_id, admin_user_id, true, 'REC-2024-25');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina febrero', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 18 Febrero: Venta de servicios
    asiento_id := crear_asiento('2024-02-18', 'Venta de servicios de consultoría', periodo_febrero_id, admin_user_id, true, 'FACT-V-2024-010');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 30000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 30000, admin_user_id);
    
    -- 22 Febrero: Pago de impuestos
    asiento_id := crear_asiento('2024-02-22', 'Pago de impuestos mensuales', periodo_febrero_id, admin_user_id, true, 'IMPUESTO-2024-02');
    PERFORM agregar_linea_asiento(asiento_id, '6150', 'Impuestos y contribuciones', 4500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 4500, admin_user_id);
    
    -- 28 Febrero: Pago de nómina
    asiento_id := crear_asiento('2024-02-28', 'Pago de nómina mensual', periodo_febrero_id, admin_user_id, true, 'NOM-2024-02');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 18000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 18000, admin_user_id);
    
    -- ================================================================
    -- MARZO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 05 Marzo: Compra de equipo de cómputo
    asiento_id := crear_asiento('2024-03-05', 'Compra de equipos de cómputo', periodo_marzo_id, admin_user_id, true, 'FACT-2024-105');
    PERFORM agregar_linea_asiento(asiento_id, '1170', 'Equipo de cómputo', 25000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 25000, admin_user_id);
    
    -- 10 Marzo: Pago de seguros
    asiento_id := crear_asiento('2024-03-10', 'Pago de prima de seguro anual', periodo_marzo_id, admin_user_id, true, 'POL-2024-001');
    PERFORM agregar_linea_asiento(asiento_id, '1131', 'Seguros pagados por anticipado', 6000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 6000, admin_user_id);
    
    -- 15 Marzo: Pago de alquiler
    asiento_id := crear_asiento('2024-03-15', 'Pago de alquiler mensual', periodo_marzo_id, admin_user_id, true, 'REC-2024-50');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina marzo', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Marzo: Venta de servicios a crédito
    asiento_id := crear_asiento('2024-03-20', 'Venta de servicios de consultoría a crédito', periodo_marzo_id, admin_user_id, true, 'FACT-V-2024-020');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente ABC', 40000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 40000, admin_user_id);
    
    -- 25 Marzo: Pago parcial de cliente
    asiento_id := crear_asiento('2024-03-25', 'Cobro parcial de factura pendiente', periodo_marzo_id, admin_user_id, true, 'COBRO-2024-01');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente ABC', 0, 20000, admin_user_id);
    
    -- 28 Marzo: Pago de servicios públicos
    asiento_id := crear_asiento('2024-03-28', 'Pago de servicios públicos', periodo_marzo_id, admin_user_id, true, 'FACT-SERV-2024-03');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1300, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1300, admin_user_id);
    
    -- 31 Marzo: Pago de nómina
    asiento_id := crear_asiento('2024-03-31', 'Pago de nómina mensual', periodo_marzo_id, admin_user_id, true, 'NOM-2024-03');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 18000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 18000, admin_user_id);
    
    -- ================================================================
    -- ABRIL 2024 (hasta el día 10): ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Abril: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-04-01', 'Pago de cuota de préstamo bancario', periodo_abril_id, admin_user_id, true, 'PREST-2024-04');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 800, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2800, admin_user_id);
    
    -- 05 Abril: Pago anticipado de publicidad
    asiento_id := crear_asiento('2024-04-05', 'Pago anticipado de campaña publicitaria', periodo_abril_id, admin_user_id, true, 'FACT-PUB-2024-01');
    PERFORM agregar_linea_asiento(asiento_id, '1132', 'Publicidad pagada por anticipado', 4500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 4500, admin_user_id);
    
    -- 08 Abril: Venta de servicios
    asiento_id := crear_asiento('2024-04-08', 'Venta de servicios de consultoría', periodo_abril_id, admin_user_id, true, 'FACT-V-2024-025');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 35000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 35000, admin_user_id);
    
    -- 10 Abril: Compra de suministros a crédito
    asiento_id := crear_asiento('2024-04-10', 'Compra de suministros a crédito', periodo_abril_id, admin_user_id, true, 'FACT-2024-125');
    PERFORM agregar_linea_asiento(asiento_id, '6140', 'Suministros de oficina', 3500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '2111', 'Cuenta por pagar proveedor XYZ', 0, 3500, admin_user_id);
END $$;

-- Mensaje de confirmación
SELECT 'Asientos contables generados exitosamente para el período Enero-Abril 2024' AS resultado; 

-- Reactivar los triggers
DO $$
BEGIN
    -- Reactivar todos los triggers de journal_entries
    ALTER TABLE journal_entries ENABLE TRIGGER USER;
    
    -- Alternativamente, reactivar triggers específicos si es necesario
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_journal_entry_trigger') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER check_journal_entry_trigger;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entries_permission_trigger') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER journal_entries_permission_trigger;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'check_journal_permissions') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER check_journal_permissions;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_approval_sync') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER journal_entry_approval_sync;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'journal_entry_date_validation') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER journal_entry_date_validation;
    END IF;
    
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_journal_entry_trigger') THEN
        ALTER TABLE journal_entries ENABLE TRIGGER validate_journal_entry_trigger;
    END IF;
END $$; 