-- Script SQL para generar asientos contables: Agosto a Diciembre 2024
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
    
    -- Obtener IDs de los períodos mensuales
    SELECT id INTO periodo_agosto_id FROM public.monthly_accounting_periods WHERE name = 'Agosto 2024';
    SELECT id INTO periodo_septiembre_id FROM public.monthly_accounting_periods WHERE name = 'Septiembre 2024';
    SELECT id INTO periodo_octubre_id FROM public.monthly_accounting_periods WHERE name = 'Octubre 2024';
    SELECT id INTO periodo_noviembre_id FROM public.monthly_accounting_periods WHERE name = 'Noviembre 2024';
    SELECT id INTO periodo_diciembre_id FROM public.monthly_accounting_periods WHERE name = 'Diciembre 2024';

    -- ================================================================
    -- AGOSTO 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Agosto: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-08-01', 'Pago de cuota de préstamo bancario', periodo_agosto_id, admin_user_id, true, 'PREST-2024-08');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 720, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2720, admin_user_id);
    
    -- 05 Agosto: Pago de nómina
    asiento_id := crear_asiento('2024-08-05', 'Pago de nómina mensual', periodo_agosto_id, admin_user_id, true, 'NOM-2024-08');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 19500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 19500, admin_user_id);
    
    -- 12 Agosto: Venta de servicios a crédito
    asiento_id := crear_asiento('2024-08-12', 'Venta de servicios profesionales a crédito', periodo_agosto_id, admin_user_id, true, 'FACT-V-2024-045');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente ABC', 32000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 32000, admin_user_id);
    
    -- 15 Agosto: Pago de alquiler
    asiento_id := crear_asiento('2024-08-15', 'Pago de alquiler mensual', periodo_agosto_id, admin_user_id, true, 'REC-2024-70');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina agosto', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Agosto: Cobro parcial cliente
    asiento_id := crear_asiento('2024-08-20', 'Cobro parcial cliente ABC', periodo_agosto_id, admin_user_id, true, 'COBRO-2024-08');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente ABC', 0, 20000, admin_user_id);
    
    -- 25 Agosto: Pago servicios públicos
    asiento_id := crear_asiento('2024-08-25', 'Pago de servicios públicos', periodo_agosto_id, admin_user_id, true, 'FACT-SERV-2024-08');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1550, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1550, admin_user_id);

    -- ================================================================
    -- SEPTIEMBRE 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Septiembre: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-09-01', 'Pago de cuota de préstamo bancario', periodo_septiembre_id, admin_user_id, true, 'PREST-2024-09');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 700, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2700, admin_user_id);
    
    -- 05 Septiembre: Pago de nómina
    asiento_id := crear_asiento('2024-09-05', 'Pago de nómina mensual', periodo_septiembre_id, admin_user_id, true, 'NOM-2024-09');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 20000, admin_user_id);
    
    -- 10 Septiembre: Venta de servicios
    asiento_id := crear_asiento('2024-09-10', 'Venta de servicios profesionales', periodo_septiembre_id, admin_user_id, true, 'FACT-V-2024-050');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 38000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 38000, admin_user_id);
    
    -- 15 Septiembre: Pago de alquiler
    asiento_id := crear_asiento('2024-09-15', 'Pago de alquiler mensual', periodo_septiembre_id, admin_user_id, true, 'REC-2024-75');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina septiembre', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Septiembre: Pago servicios públicos
    asiento_id := crear_asiento('2024-09-20', 'Pago de servicios públicos', periodo_septiembre_id, admin_user_id, true, 'FACT-SERV-2024-09');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1600, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1600, admin_user_id);

    -- ================================================================
    -- OCTUBRE 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Octubre: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-10-01', 'Pago de cuota de préstamo bancario', periodo_octubre_id, admin_user_id, true, 'PREST-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 680, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2680, admin_user_id);
    
    -- 05 Octubre: Pago de nómina
    asiento_id := crear_asiento('2024-10-05', 'Pago de nómina mensual', periodo_octubre_id, admin_user_id, true, 'NOM-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 20000, admin_user_id);
    
    -- 12 Octubre: Venta de servicios a crédito
    asiento_id := crear_asiento('2024-10-12', 'Venta de servicios profesionales a crédito', periodo_octubre_id, admin_user_id, true, 'FACT-V-2024-055');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente XYZ', 45000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 45000, admin_user_id);
    
    -- 15 Octubre: Pago de alquiler
    asiento_id := crear_asiento('2024-10-15', 'Pago de alquiler mensual', periodo_octubre_id, admin_user_id, true, 'REC-2024-80');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina octubre', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Octubre: Cobro parcial cliente
    asiento_id := crear_asiento('2024-10-20', 'Cobro parcial cliente XYZ', periodo_octubre_id, admin_user_id, true, 'COBRO-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 25000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente XYZ', 0, 25000, admin_user_id);
    
    -- 25 Octubre: Pago servicios públicos
    asiento_id := crear_asiento('2024-10-25', 'Pago de servicios públicos', periodo_octubre_id, admin_user_id, true, 'FACT-SERV-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1650, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1650, admin_user_id);
END $$;

-- Reactivar los triggers
DO $$
BEGIN
    -- Reactivar todos los triggers de journal_entries
    ALTER TABLE journal_entries ENABLE TRIGGER USER;
END $$;

-- Mensaje de confirmación
SELECT 'Asientos contables generados exitosamente para el período Agosto-Octubre 2024' AS resultado; 