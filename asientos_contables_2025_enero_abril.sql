-- Script SQL para generar asientos contables: Enero a 10 Abril 2025
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
    periodo_enero_id UUID;
    periodo_febrero_id UUID;
    periodo_marzo_id UUID;
    periodo_abril_id UUID;
    asiento_id UUID;
BEGIN
    -- Verificar usuario válido
    IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = admin_user_id AND role IN ('admin', 'accountant')) THEN
        RAISE EXCEPTION 'El ID del usuario administrador no es válido o no tiene los permisos necesarios';
    END IF;
    
    -- Obtener el ID del periodo anual 2025
    SELECT id INTO periodo_anual_id FROM public.accounting_periods WHERE name = 'Año Calendario 2025';
    
    -- Obtener IDs de los períodos mensuales 2025
    SELECT id INTO periodo_enero_id FROM public.monthly_accounting_periods WHERE year = 2025 AND month = 1;
    SELECT id INTO periodo_febrero_id FROM public.monthly_accounting_periods WHERE year = 2025 AND month = 2;
    SELECT id INTO periodo_marzo_id FROM public.monthly_accounting_periods WHERE year = 2025 AND month = 3;
    SELECT id INTO periodo_abril_id FROM public.monthly_accounting_periods WHERE year = 2025 AND month = 4;

    -- ================================================================
    -- ENERO 2025: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Enero: Pago de préstamo bancario
    asiento_id := crear_asiento('2025-01-01', 'Pago de cuota de préstamo bancario', periodo_enero_id, admin_user_id, true, 'PREST-2025-01');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 600, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2600, admin_user_id);
    
    -- 05 Enero: Pago de nómina
    asiento_id := crear_asiento('2025-01-05', 'Pago de nómina mensual', periodo_enero_id, admin_user_id, true, 'NOM-2025-01');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 21000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 21000, admin_user_id);
    
    -- 10 Enero: Cobro cliente pendiente del año anterior
    asiento_id := crear_asiento('2025-01-10', 'Cobro saldo pendiente cliente DEF', periodo_enero_id, admin_user_id, true, 'COBRO-2025-01');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 30000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Liquidación cuenta por cobrar cliente DEF', 0, 30000, admin_user_id);
    
    -- 15 Enero: Pago de alquiler
    asiento_id := crear_asiento('2025-01-15', 'Pago de alquiler mensual', periodo_enero_id, admin_user_id, true, 'REC-2025-01');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina enero', 5200, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5200, admin_user_id);
    
    -- 20 Enero: Venta de servicios 
    asiento_id := crear_asiento('2025-01-20', 'Venta de servicios profesionales', periodo_enero_id, admin_user_id, true, 'FACT-V-2025-001');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 45000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 45000, admin_user_id);
    
    -- 25 Enero: Pago servicios públicos
    asiento_id := crear_asiento('2025-01-25', 'Pago de servicios públicos', periodo_enero_id, admin_user_id, true, 'FACT-SERV-2025-01');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1800, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1800, admin_user_id);

    -- ================================================================
    -- FEBRERO 2025: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Febrero: Pago de préstamo bancario
    asiento_id := crear_asiento('2025-02-01', 'Pago de cuota de préstamo bancario', periodo_febrero_id, admin_user_id, true, 'PREST-2025-02');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 580, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2580, admin_user_id);
    
    -- 05 Febrero: Pago de nómina
    asiento_id := crear_asiento('2025-02-05', 'Pago de nómina mensual', periodo_febrero_id, admin_user_id, true, 'NOM-2025-02');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 21000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 21000, admin_user_id);
    
    -- 10 Febrero: Venta de servicios a crédito
    asiento_id := crear_asiento('2025-02-10', 'Venta de servicios profesionales a crédito', periodo_febrero_id, admin_user_id, true, 'FACT-V-2025-005');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente GHI', 38000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 38000, admin_user_id);
    
    -- 15 Febrero: Pago de alquiler
    asiento_id := crear_asiento('2025-02-15', 'Pago de alquiler mensual', periodo_febrero_id, admin_user_id, true, 'REC-2025-05');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina febrero', 5200, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5200, admin_user_id);
    
    -- 20 Febrero: Cobro parcial cliente
    asiento_id := crear_asiento('2025-02-20', 'Cobro parcial cliente GHI', periodo_febrero_id, admin_user_id, true, 'COBRO-2025-02');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 18000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Abono a cuenta por cobrar cliente GHI', 0, 18000, admin_user_id);
    
    -- 25 Febrero: Pago servicios públicos
    asiento_id := crear_asiento('2025-02-25', 'Pago de servicios públicos', periodo_febrero_id, admin_user_id, true, 'FACT-SERV-2025-02');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1850, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1850, admin_user_id);

    -- ================================================================
    -- MARZO 2025: ASIENTOS CONTABLES
    -- ================================================================
    
    -- 01 Marzo: Pago de préstamo bancario
    asiento_id := crear_asiento('2025-03-01', 'Pago de cuota de préstamo bancario', periodo_marzo_id, admin_user_id, true, 'PREST-2025-03');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 560, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2560, admin_user_id);
    
    -- 05 Marzo: Pago de nómina
    asiento_id := crear_asiento('2025-03-05', 'Pago de nómina mensual', periodo_marzo_id, admin_user_id, true, 'NOM-2025-03');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 21000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 21000, admin_user_id);
    
    -- 10 Marzo: Venta de servicios
    asiento_id := crear_asiento('2025-03-10', 'Venta de servicios profesionales', periodo_marzo_id, admin_user_id, true, 'FACT-V-2025-010');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 52000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 52000, admin_user_id);
    
    -- 15 Marzo: Pago de alquiler
    asiento_id := crear_asiento('2025-03-15', 'Pago de alquiler mensual', periodo_marzo_id, admin_user_id, true, 'REC-2025-10');
    PERFORM agregar_linea_asiento(asiento_id, '6120', 'Alquiler de oficina marzo', 5200, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 5200, admin_user_id);
    
    -- 20 Marzo: Cobro cliente pendiente
    asiento_id := crear_asiento('2025-03-20', 'Cobro saldo pendiente cliente GHI', periodo_marzo_id, admin_user_id, true, 'COBRO-2025-03');
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Cobro en cuenta bancaria', 20000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Liquidación cuenta por cobrar cliente GHI', 0, 20000, admin_user_id);
    
    -- 25 Marzo: Pago servicios públicos
    asiento_id := crear_asiento('2025-03-25', 'Pago de servicios públicos', periodo_marzo_id, admin_user_id, true, 'FACT-SERV-2025-03');
    PERFORM agregar_linea_asiento(asiento_id, '6130', 'Electricidad y agua', 1900, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 1900, admin_user_id);

    -- ================================================================
    -- ABRIL 2025: ASIENTOS CONTABLES (hasta el día 10)
    -- ================================================================
    
    -- 01 Abril: Pago de préstamo bancario
    asiento_id := crear_asiento('2025-04-01', 'Pago de cuota de préstamo bancario', periodo_abril_id, admin_user_id, true, 'PREST-2025-04');
    PERFORM agregar_linea_asiento(asiento_id, '2210', 'Préstamo bancario por pagar', 2000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '6310', 'Intereses de préstamo bancario', 540, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 2540, admin_user_id);
    
    -- 05 Abril: Pago de nómina
    asiento_id := crear_asiento('2025-04-05', 'Pago de nómina mensual', periodo_abril_id, admin_user_id, true, 'NOM-2025-04');
    PERFORM agregar_linea_asiento(asiento_id, '6110', 'Sueldos y salarios', 21000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '1113.01', 'Pago desde cuenta bancaria', 0, 21000, admin_user_id);
    
    -- 10 Abril: Venta de servicios a crédito
    asiento_id := crear_asiento('2025-04-10', 'Venta de servicios profesionales a crédito', periodo_abril_id, admin_user_id, true, 'FACT-V-2025-015');
    PERFORM agregar_linea_asiento(asiento_id, '1121', 'Cuenta por cobrar cliente JKL', 48000, 0, admin_user_id);
    PERFORM agregar_linea_asiento(asiento_id, '4110', 'Ingresos por servicios profesionales', 0, 48000, admin_user_id);
END $$;

-- Reactivar los triggers
DO $$
BEGIN
    -- Reactivar todos los triggers de journal_entries
    ALTER TABLE journal_entries ENABLE TRIGGER USER;
END $$;

-- Mensaje de confirmación
SELECT 'Asientos contables generados exitosamente para el período Enero-10 Abril 2025' AS resultado; 