-- Script para poblar la base de datos con catálogo de cuentas completo de República Dominicana

-- Variables para el ID del administrador
DO $$
DECLARE
    admin_id UUID;
    user_found BOOLEAN;
    
    -- Variables para IDs de categorías principales
    pasivo_id UUID;
    capital_id UUID;
    ingresos_id UUID;
    gastos_id UUID;
    costos_id UUID;
    
    -- Variables para IDs principales
    pasivos_corrientes_id UUID;
    pasivos_no_corrientes_id UUID;
    
    -- Variables para IDs de subcuentas
    cuentas_por_pagar_id UUID;
    impuestos_por_pagar_id UUID;
    beneficios_empleados_id UUID;
    prestamos_lp_id UUID;
    capital_contable_id UUID;
    resultados_id UUID;
    ingresos_operacionales_id UUID;
    ingresos_no_operacionales_id UUID;
    costo_ventas_id UUID;
    gastos_operacionales_id UUID;
    gastos_admin_id UUID;
    gastos_ventas_id UUID;
    gastos_no_operacionales_id UUID;
    
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

    -- Verificar si ya existe catálogo parcial
    IF EXISTS (SELECT 1 FROM accounts WHERE code = '2000000') THEN
        SELECT id INTO pasivo_id FROM accounts WHERE code = '2000000' LIMIT 1;
        RAISE NOTICE 'Utilizando Pasivos existentes con ID: %', pasivo_id;
    ELSE
        -- Crear cuenta principal de Pasivos si no existe
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2000000', 'PASIVOS', 'Obligaciones presentes de la entidad', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, NULL)
        RETURNING id INTO pasivo_id;
    END IF;
    
    -- Verificar si ya existen pasivos corrientes
    IF EXISTS (SELECT 1 FROM accounts WHERE code = '2100000') THEN
        SELECT id INTO pasivos_corrientes_id FROM accounts WHERE code = '2100000' LIMIT 1;
    ELSE
        -- Crear pasivos corrientes si no existen
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2100000', 'PASIVOS CORRIENTES', 'Obligaciones a corto plazo', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivo_id)
        RETURNING id INTO pasivos_corrientes_id;
    END IF;
    
    -- Verificar si existe capital
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3000000') THEN
        -- Crear cuenta principal de Capital
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '3000000', 'CAPITAL', 'Patrimonio de la empresa', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', true, NULL)
        RETURNING id INTO capital_id;
    ELSE
        SELECT id INTO capital_id FROM accounts WHERE code = '3000000' LIMIT 1;
    END IF;
    
    -- Verificar si existen Ingresos
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '4000000') THEN
        -- Crear cuenta principal de Ingresos
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '4000000', 'INGRESOS', 'Ingresos de la empresa', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', true, NULL)
        RETURNING id INTO ingresos_id;
    ELSE
        SELECT id INTO ingresos_id FROM accounts WHERE code = '4000000' LIMIT 1;
    END IF;
    
    -- Verificar si existen Gastos
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5000000') THEN
        -- Crear cuenta principal de Gastos
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5000000', 'GASTOS', 'Gastos de la empresa', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', true, NULL)
        RETURNING id INTO gastos_id;
    ELSE
        SELECT id INTO gastos_id FROM accounts WHERE code = '5000000' LIMIT 1;
    END IF;
    
    -- Verificar si existen Costos como cuenta separada
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '6000000') THEN
        -- Crear cuenta principal de Costos
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '6000000', 'COSTOS', 'Costos de la empresa', true, NOW(), admin_id, NOW(), 'deudora', 'costo', true, NULL)
        RETURNING id INTO costos_id;
    ELSE
        SELECT id INTO costos_id FROM accounts WHERE code = '6000000' LIMIT 1;
    END IF;
    
    -- COMPLETAR PASIVOS
    -- Cuentas por Pagar
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2110000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2110000', 'CUENTAS POR PAGAR', 'Obligaciones con proveedores y terceros', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivos_corrientes_id);
    END IF;
    
    -- Obtener ID de la cuenta Cuentas por Pagar
    SELECT id INTO cuentas_por_pagar_id FROM accounts WHERE code = '2110000' LIMIT 1;
    
    -- Subcuentas de Cuentas por Pagar
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2110100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2110100', 'Proveedores Locales', 'Cuentas por pagar a proveedores nacionales', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, cuentas_por_pagar_id),
        (gen_random_uuid(), '2110200', 'Proveedores del Exterior', 'Cuentas por pagar a proveedores extranjeros', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, cuentas_por_pagar_id),
        (gen_random_uuid(), '2110300', 'Documentos por Pagar', 'Obligaciones documentadas', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, cuentas_por_pagar_id);
    END IF;
    
    -- Impuestos por Pagar
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2120000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2120000', 'IMPUESTOS POR PAGAR', 'Obligaciones fiscales', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivos_corrientes_id);
    END IF;
    
    -- Obtener ID de Impuestos por Pagar
    SELECT id INTO impuestos_por_pagar_id FROM accounts WHERE code = '2120000' LIMIT 1;
    
    -- Subcuentas de Impuestos por Pagar
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2120100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2120100', 'ITBIS por Pagar', 'Impuesto sobre Transferencias de Bienes por pagar', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, impuestos_por_pagar_id),
        (gen_random_uuid(), '2120200', 'ISR por Pagar', 'Impuesto Sobre la Renta por pagar', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, impuestos_por_pagar_id),
        (gen_random_uuid(), '2120300', 'Retenciones de ISR', 'Retenciones de ISR por pagar', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, impuestos_por_pagar_id),
        (gen_random_uuid(), '2120400', 'Impuesto a los Activos', 'Impuesto a los Activos por pagar', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, impuestos_por_pagar_id);
    END IF;
    
    -- Beneficios a Empleados por Pagar
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2130000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2130000', 'BENEFICIOS A EMPLEADOS', 'Obligaciones laborales', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivos_corrientes_id);
    END IF;
    
    -- Obtener ID de Beneficios a Empleados
    SELECT id INTO beneficios_empleados_id FROM accounts WHERE code = '2130000' LIMIT 1;
    
    -- Subcuentas de Beneficios a Empleados
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2130100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2130100', 'Sueldos por Pagar', 'Sueldos pendientes de pago', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, beneficios_empleados_id),
        (gen_random_uuid(), '2130200', 'Vacaciones por Pagar', 'Provisión de vacaciones', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, beneficios_empleados_id),
        (gen_random_uuid(), '2130300', 'Regalía Pascual por Pagar', 'Provisión de regalía pascual', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, beneficios_empleados_id),
        (gen_random_uuid(), '2130400', 'Bonificaciones por Pagar', 'Provisión de bonificaciones', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, beneficios_empleados_id),
        (gen_random_uuid(), '2130500', 'Prestaciones Laborales', 'Provisión de prestaciones laborales', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, beneficios_empleados_id);
    END IF;
    
    -- Pasivos No Corrientes
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2200000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2200000', 'PASIVOS NO CORRIENTES', 'Obligaciones a largo plazo', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivo_id)
        RETURNING id INTO pasivos_no_corrientes_id;
    ELSE
        SELECT id INTO pasivos_no_corrientes_id FROM accounts WHERE code = '2200000' LIMIT 1;
    END IF;
    
    -- Préstamos a Largo Plazo
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2210000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2210000', 'PRÉSTAMOS A LARGO PLAZO', 'Obligaciones financieras a largo plazo', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', true, pasivos_no_corrientes_id);
    END IF;
    
    -- Obtener ID de Préstamos a Largo Plazo
    SELECT id INTO prestamos_lp_id FROM accounts WHERE code = '2210000' LIMIT 1;
    
    -- Subcuentas de Préstamos a Largo Plazo
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '2210100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '2210100', 'Préstamos Bancarios', 'Préstamos con entidades bancarias', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, prestamos_lp_id),
        (gen_random_uuid(), '2210200', 'Hipotecas por Pagar', 'Préstamos con garantía hipotecaria', true, NOW(), admin_id, NOW(), 'acreedora', 'pasivo', false, prestamos_lp_id);
    END IF;
    
    -- CAPITAL
    -- Capital Contable
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3100000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '3100000', 'CAPITAL CONTABLE', 'Inversión de los accionistas', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', true, capital_id);
    END IF;
    
    -- Obtener ID de Capital Contable
    SELECT id INTO capital_contable_id FROM accounts WHERE code = '3100000' LIMIT 1;
    
    -- Subcuentas de Capital Contable
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3110000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '3110000', 'Capital Social', 'Capital aportado por los socios', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', false, capital_contable_id),
        (gen_random_uuid(), '3120000', 'Reserva Legal', 'Reserva legal obligatoria', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', false, capital_contable_id),
        (gen_random_uuid(), '3130000', 'Reservas Estatutarias', 'Reservas establecidas por estatutos', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', false, capital_contable_id);
    END IF;
    
    -- Resultados
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3200000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '3200000', 'RESULTADOS', 'Resultados acumulados', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', true, capital_id);
    END IF;
    
    -- Obtener ID de Resultados
    SELECT id INTO resultados_id FROM accounts WHERE code = '3200000' LIMIT 1;
    
    -- Subcuentas de Resultados
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '3210000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '3210000', 'Utilidades Acumuladas', 'Utilidades no distribuidas', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', false, resultados_id),
        (gen_random_uuid(), '3220000', 'Pérdidas Acumuladas', 'Pérdidas de ejercicios anteriores', true, NOW(), admin_id, NOW(), 'deudora', 'patrimonio', false, resultados_id),
        (gen_random_uuid(), '3230000', 'Resultado del Ejercicio', 'Resultado del período actual', true, NOW(), admin_id, NOW(), 'acreedora', 'patrimonio', false, resultados_id);
    END IF;
    
    -- INGRESOS
    -- Ingresos Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '4100000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '4100000', 'INGRESOS OPERACIONALES', 'Ingresos por actividades ordinarias', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', true, ingresos_id);
    END IF;
    
    -- Obtener ID de Ingresos Operacionales
    SELECT id INTO ingresos_operacionales_id FROM accounts WHERE code = '4100000' LIMIT 1;
    
    -- Subcuentas de Ingresos Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '4110000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '4110000', 'Ventas de Bienes', 'Ingresos por venta de productos', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_operacionales_id),
        (gen_random_uuid(), '4120000', 'Prestación de Servicios', 'Ingresos por servicios', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_operacionales_id),
        (gen_random_uuid(), '4130000', 'Devoluciones y Descuentos', 'Devoluciones y descuentos en ventas', true, NOW(), admin_id, NOW(), 'deudora', 'ingreso', false, ingresos_operacionales_id);
    END IF;
    
    -- Ingresos No Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '4200000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '4200000', 'INGRESOS NO OPERACIONALES', 'Ingresos diferentes a la actividad principal', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', true, ingresos_id);
    END IF;
    
    -- Obtener ID de Ingresos No Operacionales
    SELECT id INTO ingresos_no_operacionales_id FROM accounts WHERE code = '4200000' LIMIT 1;
    
    -- Subcuentas de Ingresos No Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '4210000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '4210000', 'Ingresos Financieros', 'Intereses y rendimientos financieros', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_no_operacionales_id),
        (gen_random_uuid(), '4220000', 'Ganancia en Venta de Activos', 'Utilidad en venta de activos fijos', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_no_operacionales_id),
        (gen_random_uuid(), '4230000', 'Diferencia Cambiaria', 'Ganancia por tipo de cambio', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_no_operacionales_id),
        (gen_random_uuid(), '4240000', 'Otros Ingresos', 'Otros ingresos diversos', true, NOW(), admin_id, NOW(), 'acreedora', 'ingreso', false, ingresos_no_operacionales_id);
    END IF;
    
    -- COSTOS
    -- Costo de Ventas
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '6100000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '6100000', 'COSTO DE VENTAS', 'Costo de los bienes vendidos', true, NOW(), admin_id, NOW(), 'deudora', 'costo', true, costos_id);
    END IF;
    
    -- Obtener ID de Costo de Ventas
    SELECT id INTO costo_ventas_id FROM accounts WHERE code = '6100000' LIMIT 1;
    
    -- Subcuentas de Costo de Ventas
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '6110000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '6110000', 'Costo de Mercancías', 'Costo de productos comercializados', true, NOW(), admin_id, NOW(), 'deudora', 'costo', false, costo_ventas_id),
        (gen_random_uuid(), '6120000', 'Costo de Servicios', 'Costo de servicios prestados', true, NOW(), admin_id, NOW(), 'deudora', 'costo', false, costo_ventas_id);
    END IF;
    
    -- GASTOS
    -- Gastos Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5200000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5200000', 'GASTOS OPERACIONALES', 'Gastos de la operación ordinaria', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', true, gastos_id);
    END IF;
    
    -- Obtener ID de Gastos Operacionales
    SELECT id INTO gastos_operacionales_id FROM accounts WHERE code = '5200000' LIMIT 1;
    
    -- Gastos de Administración
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5210000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5210000', 'Gastos de Administración', 'Gastos del área administrativa', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', true, gastos_operacionales_id);
    END IF;
    
    -- Obtener ID de Gastos de Administración
    SELECT id INTO gastos_admin_id FROM accounts WHERE code = '5210000' LIMIT 1;
    
    -- Subcuentas de Gastos de Administración
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5210100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5210100', 'Sueldos y Salarios', 'Remuneraciones al personal', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210200', 'Beneficios a Empleados', 'Prestaciones y beneficios sociales', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210300', 'Arrendamientos', 'Alquiler de oficinas y locales', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210400', 'Honorarios Profesionales', 'Servicios profesionales', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210500', 'Depreciación', 'Depreciación de activos fijos', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210600', 'Amortización', 'Amortización de intangibles', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210700', 'Impuestos y Tasas', 'Impuestos diferentes a renta', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210800', 'Servicios Públicos', 'Electricidad, agua, teléfono, internet', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5210900', 'Mantenimiento y Reparaciones', 'Gastos de mantenimiento', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id),
        (gen_random_uuid(), '5211000', 'Seguros', 'Primas de seguros', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_admin_id);
    END IF;
    
    -- Gastos de Ventas
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5220000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5220000', 'Gastos de Ventas', 'Gastos del área comercial', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', true, gastos_operacionales_id);
    END IF;
    
    -- Obtener ID de Gastos de Ventas
    SELECT id INTO gastos_ventas_id FROM accounts WHERE code = '5220000' LIMIT 1;
    
    -- Subcuentas de Gastos de Ventas
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5220100') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5220100', 'Sueldos y Comisiones', 'Remuneraciones al personal de ventas', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_ventas_id),
        (gen_random_uuid(), '5220200', 'Publicidad y Mercadeo', 'Gastos de promoción y publicidad', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_ventas_id),
        (gen_random_uuid(), '5220300', 'Transporte y Distribución', 'Gastos de distribución de mercancías', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_ventas_id),
        (gen_random_uuid(), '5220400', 'Atención a Clientes', 'Gastos de atención a clientes', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_ventas_id);
    END IF;
    
    -- Gastos No Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5300000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5300000', 'GASTOS NO OPERACIONALES', 'Gastos no relacionados con la operación', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', true, gastos_id);
    END IF;
    
    -- Obtener ID de Gastos No Operacionales
    SELECT id INTO gastos_no_operacionales_id FROM accounts WHERE code = '5300000' LIMIT 1;
    
    -- Subcuentas de Gastos No Operacionales
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5310000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5310000', 'Gastos Financieros', 'Intereses, comisiones bancarias', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_no_operacionales_id),
        (gen_random_uuid(), '5320000', 'Pérdida en Venta de Activos', 'Pérdida en venta de activos fijos', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_no_operacionales_id),
        (gen_random_uuid(), '5330000', 'Diferencia Cambiaria', 'Pérdida por tipo de cambio', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_no_operacionales_id),
        (gen_random_uuid(), '5340000', 'Otros Gastos', 'Otros gastos diversos', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_no_operacionales_id);
    END IF;
    
    -- Impuestos sobre la Renta
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE code = '5400000') THEN
        INSERT INTO accounts (id, code, name, description, is_active, created_at, created_by, updated_at, nature, type, is_parent, parent_id)
        VALUES
        (gen_random_uuid(), '5400000', 'IMPUESTO SOBRE LA RENTA', 'Provisión de impuesto sobre la renta', true, NOW(), admin_id, NOW(), 'deudora', 'gasto', false, gastos_id);
    END IF;

    RAISE NOTICE 'Catálogo de cuentas completo creado exitosamente para República Dominicana.';

END $$;

-- Confirmar finalización
SELECT 'Catálogo completo de cuentas de República Dominicana ha sido creado' AS resultado; 