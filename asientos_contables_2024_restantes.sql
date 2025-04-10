-- Script SQL para generar asientos contables: Mayo a Diciembre 2024
-- Contadom - Sistema de Contabilidad

-- Referencia a la extensión uuid-ossp
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
END $$;

DO $$
DECLARE
    admin_user_id UUID := 'c1c210ea-5e83-4095-af4a-35009c9701a3'::UUID; -- ID específico de un usuario con rol admin
    periodo_anual_id UUID;
    periodo_mayo_id UUID;
    periodo_junio_id UUID;
    periodo_julio_id UUID;
    periodo_agosto_id UUID;
    periodo_septiembre_id UUID;
    periodo_octubre_id UUID;
    periodo_noviembre_id UUID;
    periodo_diciembre_id UUID;
    asiento_id UUID;
BEGIN
    -- Verificar usuario válido
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = admin_user_id AND role IN ('admin', 'accountant')) THEN
        RAISE EXCEPTION 'El ID del usuario administrador no es válido o no tiene los permisos necesarios';
    END IF;
    
    -- Crear el periodo anual 2024 si no existe
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
        -- Obtener el ID del periodo anual 2024 si ya existe
        SELECT id INTO periodo_anual_id FROM public.accounting_periods WHERE name = 'Año Fiscal 2024';
    END IF;
    
    -- Verificar que el período anual se haya creado correctamente
    IF periodo_anual_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo crear o encontrar el período anual 2024';
    END IF;
    
    -- Crear período Mayo 2024 si no existe
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Mayo 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Mayo 2024', '2024-05-01', '2024-05-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 5, 2024
        )
        RETURNING id INTO periodo_mayo_id;
    ELSE
        SELECT id INTO periodo_mayo_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Mayo 2024';
    END IF;

    -- Crear período Junio 2024 si no existe
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Junio 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Junio 2024', '2024-06-01', '2024-06-30', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 6, 2024
        )
        RETURNING id INTO periodo_junio_id;
    ELSE
        SELECT id INTO periodo_junio_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Junio 2024';
    END IF;

    -- Crear período Julio 2024 si no existe
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Julio 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Julio 2024', '2024-07-01', '2024-07-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 7, 2024
        )
        RETURNING id INTO periodo_julio_id;
    ELSE
        SELECT id INTO periodo_julio_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Julio 2024';
    END IF;

    -- Crear períodos restantes (Agosto a Diciembre)
    -- Agosto 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Agosto 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Agosto 2024', '2024-08-01', '2024-08-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 8, 2024
        )
        RETURNING id INTO periodo_agosto_id;
    ELSE
        SELECT id INTO periodo_agosto_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Agosto 2024';
    END IF;

    -- Septiembre 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Septiembre 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Septiembre 2024', '2024-09-01', '2024-09-30', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 9, 2024
        )
        RETURNING id INTO periodo_septiembre_id;
    ELSE
        SELECT id INTO periodo_septiembre_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Septiembre 2024';
    END IF;

    -- Octubre 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Octubre 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Octubre 2024', '2024-10-01', '2024-10-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 10, 2024
        )
        RETURNING id INTO periodo_octubre_id;
    ELSE
        SELECT id INTO periodo_octubre_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Octubre 2024';
    END IF;

    -- Noviembre 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Noviembre 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Noviembre 2024', '2024-11-01', '2024-11-30', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 11, 2024
        )
        RETURNING id INTO periodo_noviembre_id;
    ELSE
        SELECT id INTO periodo_noviembre_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Noviembre 2024';
    END IF;

    -- Diciembre 2024
    IF NOT EXISTS (SELECT 1 FROM public.monthly_accounting_periods WHERE name = 'Diciembre 2024') THEN
        INSERT INTO public.monthly_accounting_periods (
            id, name, start_date, end_date, fiscal_year_id,
            is_closed, is_active, created_at, created_by, updated_at, month, year
        ) 
        VALUES (
            uuid_generate_v4(), 'Diciembre 2024', '2024-12-01', '2024-12-31', periodo_anual_id,
            false, true, NOW(), admin_user_id, NOW(), 12, 2024
        )
        RETURNING id INTO periodo_diciembre_id;
    ELSE
        SELECT id INTO periodo_diciembre_id 
        FROM public.monthly_accounting_periods 
        WHERE name = 'Diciembre 2024';
    END IF;

    -- ================================================================
    -- MAYO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 05 Mayo: Pago de nómina
    asiento_id := crear_asiento('2024-05-05', 'Pago de nómina mensual', periodo_mayo_id, admin_user_id, true, 'NOM-2024-05');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 19000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 19000, admin_user_id);
    
    -- 10 Mayo: Cobro de servicios
    asiento_id := crear_asiento('2024-05-10', 'Cobro por servicios de consultoría', periodo_mayo_id, admin_user_id, true, 'FACT-V-2024-030');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 35000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 35000, admin_user_id);
    
    -- 15 Mayo: Pago de alquiler
    asiento_id := crear_asiento('2024-05-15', 'Pago de alquiler mensual', periodo_mayo_id, admin_user_id, true, 'REC-2024-55');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina mayo', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Mayo: Pago servicios públicos
    asiento_id := crear_asiento('2024-05-20', 'Pago de servicios públicos', periodo_mayo_id, admin_user_id, true, 'FACT-SERV-2024-05');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1400, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1400, admin_user_id);

    -- ================================================================
    -- JUNIO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 02 Junio: Venta de servicios a crédito
    asiento_id := crear_asiento('2024-06-02', 'Venta de servicios profesionales a crédito', periodo_junio_id, admin_user_id, true, 'FACT-V-2024-035');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente XYZ', 28000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 28000, admin_user_id);
    
    -- 05 Junio: Pago de nómina
    asiento_id := crear_asiento('2024-06-05', 'Pago de nómina mensual', periodo_junio_id, admin_user_id, true, 'NOM-2024-06');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 19500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 19500, admin_user_id);
    
    -- 15 Junio: Pago de alquiler
    asiento_id := crear_asiento('2024-06-15', 'Pago de alquiler mensual', periodo_junio_id, admin_user_id, true, 'REC-2024-60');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina junio', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Junio: Cobro parcial cliente
    asiento_id := crear_asiento('2024-06-20', 'Cobro parcial cliente XYZ', periodo_junio_id, admin_user_id, true, 'COBRO-2024-06');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 15000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente XYZ', 0, 15000, admin_user_id);
    
    -- 25 Junio: Pago servicios públicos
    asiento_id := crear_asiento('2024-06-25', 'Pago de servicios públicos', periodo_junio_id, admin_user_id, true, 'FACT-SERV-2024-06');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1450, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1450, admin_user_id);

    -- ================================================================
    -- JULIO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Julio: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-07-01', 'Pago de cuota de préstamo bancario', periodo_julio_id, admin_user_id, true, 'PREST-2024-07');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 750, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2750, admin_user_id);
    
    -- 05 Julio: Pago de nómina
    asiento_id := crear_asiento('2024-07-05', 'Pago de nómina mensual', periodo_julio_id, admin_user_id, true, 'NOM-2024-07');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 19500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 19500, admin_user_id);
    
    -- 10 Julio: Venta de servicios
    asiento_id := crear_asiento('2024-07-10', 'Venta de servicios profesionales', periodo_julio_id, admin_user_id, true, 'FACT-V-2024-040');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 42000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 42000, admin_user_id);
    
    -- 15 Julio: Pago de alquiler
    asiento_id := crear_asiento('2024-07-15', 'Pago de alquiler mensual', periodo_julio_id, admin_user_id, true, 'REC-2024-65');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina julio', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Julio: Pago servicios públicos
    asiento_id := crear_asiento('2024-07-20', 'Pago de servicios públicos', periodo_julio_id, admin_user_id, true, 'FACT-SERV-2024-07');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1500, admin_user_id);
END $$;

-- Reactivar los triggers
DO $$
BEGIN
    -- Reactivar todos los triggers de journal_entries
    ALTER TABLE journal_entries ENABLE TRIGGER USER;
END $$;

-- Mensaje de confirmación
SELECT 'Asientos contables generados exitosamente para el período Mayo-Julio 2024' AS resultado; 