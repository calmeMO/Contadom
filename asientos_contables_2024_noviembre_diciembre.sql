-- Script SQL para generar asientos contables: Noviembre a Diciembre 2024
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
    SELECT id INTO periodo_noviembre_id FROM public.monthly_accounting_periods WHERE name = 'Noviembre 2024';
    SELECT id INTO periodo_diciembre_id FROM public.monthly_accounting_periods WHERE name = 'Diciembre 2024';

    -- ================================================================
    -- NOVIEMBRE 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Noviembre: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-11-01', 'Pago de cuota de préstamo bancario', periodo_noviembre_id, admin_user_id, true, 'PREST-2024-11');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 650, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2650, admin_user_id);
    
    -- 05 Noviembre: Pago de nómina
    asiento_id := crear_asiento('2024-11-05', 'Pago de nómina mensual', periodo_noviembre_id, admin_user_id, true, 'NOM-2024-11');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 20500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 20500, admin_user_id);
    
    -- 10 Noviembre: Venta de servicios
    asiento_id := crear_asiento('2024-11-10', 'Venta de servicios profesionales', periodo_noviembre_id, admin_user_id, true, 'FACT-V-2024-060');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 40000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 40000, admin_user_id);
    
    -- 15 Noviembre: Pago de alquiler
    asiento_id := crear_asiento('2024-11-15', 'Pago de alquiler mensual', periodo_noviembre_id, admin_user_id, true, 'REC-2024-85');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina noviembre', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Noviembre: Cobro cliente
    asiento_id := crear_asiento('2024-11-20', 'Cobro saldo pendiente cliente XYZ', periodo_noviembre_id, admin_user_id, true, 'COBRO-2024-11');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Liquidación cuenta por cobrar cliente XYZ', 0, 20000, admin_user_id);
    
    -- 25 Noviembre: Pago servicios públicos
    asiento_id := crear_asiento('2024-11-25', 'Pago de servicios públicos', periodo_noviembre_id, admin_user_id, true, 'FACT-SERV-2024-11');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1700, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1700, admin_user_id);

    -- ================================================================
    -- DICIEMBRE 2024: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Diciembre: Pago de préstamo bancario
    asiento_id := crear_asiento('2024-12-01', 'Pago de cuota de préstamo bancario', periodo_diciembre_id, admin_user_id, true, 'PREST-2024-12');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 620, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2620, admin_user_id);
    
    -- 05 Diciembre: Pago de nómina
    asiento_id := crear_asiento('2024-12-05', 'Pago de nómina mensual', periodo_diciembre_id, admin_user_id, true, 'NOM-2024-12');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 20500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 20500, admin_user_id);
    
    -- 10 Diciembre: Venta de servicios a crédito
    asiento_id := crear_asiento('2024-12-10', 'Venta de servicios profesionales a crédito', periodo_diciembre_id, admin_user_id, true, 'FACT-V-2024-065');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente DEF', 50000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 50000, admin_user_id);
    
    -- 15 Diciembre: Pago de alquiler
    asiento_id := crear_asiento('2024-12-15', 'Pago de alquiler mensual', periodo_diciembre_id, admin_user_id, true, 'REC-2024-90');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina diciembre', 5000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5000, admin_user_id);
    
    -- 20 Diciembre: Pago de bono navideño
    asiento_id := crear_asiento('2024-12-20', 'Pago de bono navideño a empleados', periodo_diciembre_id, admin_user_id, true, 'BONO-2024-01');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Bonificaciones a empleados', 15000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 15000, admin_user_id);
    
    -- 22 Diciembre: Pago servicios públicos
    asiento_id := crear_asiento('2024-12-22', 'Pago de servicios públicos', periodo_diciembre_id, admin_user_id, true, 'FACT-SERV-2024-12');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1750, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1750, admin_user_id);
    
    -- 28 Diciembre: Compra de insumos de oficina
    asiento_id := crear_asiento('2024-12-28', 'Compra de insumos de oficina', periodo_diciembre_id, admin_user_id, true, 'FACT-COMP-2024-10');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Insumos y materiales de oficina', 3500, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 3500, admin_user_id);
    
    -- 30 Diciembre: Cobro parcial cliente
    asiento_id := crear_asiento('2024-12-30', 'Cobro parcial cliente DEF', periodo_diciembre_id, admin_user_id, true, 'COBRO-2024-12');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente DEF', 0, 20000, admin_user_id);
END $$;

-- Reactivar los triggers
DO $$
BEGIN
    -- Reactivar todos los triggers de journal_entries
    ALTER TABLE journal_entries ENABLE TRIGGER USER;
END $$;

-- Mensaje de confirmación
SELECT 'Asientos contables generados exitosamente para el período Noviembre-Diciembre 2024' AS resultado; 