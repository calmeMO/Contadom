/*
  # Cuentas Contables Estándar para República Dominicana
  
  1. Changes
    - Add default admin user if none exists
    - Insert standard accounts with proper admin reference
    - Handle NULL admin case safely
  
  2. Notes
    - Creates a default admin user if needed
    - Uses COALESCE to prevent NULL admin_id
*/

-- First ensure we have at least one admin user
DO $$ 
DECLARE
    admin_id UUID;
    default_admin_id UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
    -- Try to get an existing admin user
    SELECT id INTO admin_id FROM user_profiles WHERE role = 'admin' LIMIT 1;
    
    -- If no admin exists, create a default one
    IF admin_id IS NULL THEN
        -- First create auth.users entry
        INSERT INTO auth.users (id, email)
        VALUES (default_admin_id, 'admin@contadom.com')
        ON CONFLICT (id) DO NOTHING;
        
        -- Then create user_profile
        INSERT INTO user_profiles (id, email, role)
        VALUES (default_admin_id, 'admin@contadom.com', 'admin')
        ON CONFLICT (id) DO NOTHING
        RETURNING id INTO admin_id;
    END IF;
    
    -- Now we can safely use admin_id for our accounts
    -- Insert accounts with proper admin reference
    INSERT INTO accounts (
        id,
        category_id,
        parent_id,
        code,
        name,
        description,
        type,
        nature,
        is_active,
        created_at,
        created_by,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        cat.id,
        NULL,
        acc.code,
        acc.name,
        acc.description,
        acc.type::account_type,
        acc.nature::account_nature,
        true,
        now(),
        admin_id,
        now()
    FROM (
        VALUES
            ('11', '1101', 'Efectivo en Caja', 'Dinero en efectivo disponible', 'activo', 'deudora'),
            ('11', '1102', 'Efectivo en Bancos', 'Depósitos en cuentas bancarias', 'activo', 'deudora'),
            ('11', '1103', 'Equivalentes de Efectivo', 'Inversiones a corto plazo de alta liquidez', 'activo', 'deudora'),
            ('11', '1201', 'Cuentas por Cobrar Comerciales', 'Derechos de cobro a clientes', 'activo', 'deudora'),
            ('11', '1202', 'Provisión para Cuentas Incobrables', 'Estimación de pérdidas por incobrabilidad', 'activo', 'acreedora'),
            ('11', '1203', 'Anticipos a Proveedores', 'Pagos anticipados a proveedores', 'activo', 'deudora'),
            ('11', '1301', 'Inventario de Mercancías', 'Bienes disponibles para la venta', 'activo', 'deudora'),
            ('11', '1302', 'Inventario de Materias Primas', 'Materiales para producción', 'activo', 'deudora'),
            ('11', '1303', 'Productos en Proceso', 'Productos en fase de producción', 'activo', 'deudora'),
            ('11', '1304', 'Productos Terminados', 'Productos listos para la venta', 'activo', 'deudora'),
            ('11', '1401', 'ITBIS por Acreditar', 'Impuesto a las Transferencias de Bienes y Servicios', 'activo', 'deudora'),
            ('11', '1402', 'Anticipos de ISR', 'Pagos anticipados de ISR', 'activo', 'deudora'),
            ('11', '1501', 'Seguros Pagados por Anticipado', 'Primas de seguros pagadas por adelantado', 'activo', 'deudora'),
            ('11', '1502', 'Alquileres Pagados por Anticipado', 'Alquileres pagados por adelantado', 'activo', 'deudora'),
            ('12', '1601', 'Terrenos', 'Valor de los terrenos propiedad de la empresa', 'activo', 'deudora'),
            ('12', '1602', 'Edificios', 'Valor de las edificaciones propiedad de la empresa', 'activo', 'deudora'),
            ('12', '1603', 'Depreciación Acumulada Edificios', 'Depreciación acumulada de edificios', 'activo', 'acreedora'),
            ('12', '1604', 'Vehículos', 'Vehículos propiedad de la empresa', 'activo', 'deudora'),
            ('12', '1605', 'Depreciación Acumulada Vehículos', 'Depreciación acumulada de vehículos', 'activo', 'acreedora'),
            ('12', '1606', 'Mobiliario y Equipo de Oficina', 'Mobiliario y equipo utilizados en oficinas', 'activo', 'deudora'),
            ('12', '1607', 'Depreciación Acumulada Mobiliario', 'Depreciación acumulada de mobiliario', 'activo', 'acreedora'),
            ('12', '1701', 'Software', 'Programas informáticos adquiridos', 'activo', 'deudora'),
            ('12', '1702', 'Amortización Acumulada Software', 'Amortización acumulada de software', 'activo', 'acreedora'),
            ('12', '1703', 'Marcas y Patentes', 'Valor de las marcas y patentes registradas', 'activo', 'deudora'),
            ('21', '2101', 'Proveedores Locales', 'Deudas con proveedores locales', 'pasivo', 'acreedora'),
            ('21', '2102', 'Proveedores del Exterior', 'Deudas con proveedores extranjeros', 'pasivo', 'acreedora'),
            ('21', '2103', 'Préstamos Bancarios CP', 'Préstamos con vencimiento menor a un año', 'pasivo', 'acreedora'),
            ('21', '2201', 'ITBIS por Pagar', 'Impuesto por transferencias de bienes y servicios', 'pasivo', 'acreedora'),
            ('21', '2202', 'ISR por Pagar', 'ISR pendiente de pago', 'pasivo', 'acreedora'),
            ('21', '2203', 'Retenciones ISR por Pagar', 'Retenciones de ISR a terceros', 'pasivo', 'acreedora'),
            ('21', '2301', 'Sueldos por Pagar', 'Remuneraciones pendientes de pago', 'pasivo', 'acreedora'),
            ('21', '2302', 'TSS por Pagar', 'Tesorería de la Seguridad Social pendiente', 'pasivo', 'acreedora'),
            ('21', '2303', 'AFP por Pagar', 'Aportes a fondos de pensiones', 'pasivo', 'acreedora'),
            ('22', '2401', 'Préstamos Bancarios LP', 'Préstamos con vencimiento mayor a un año', 'pasivo', 'acreedora'),
            ('22', '2402', 'Hipotecas por Pagar', 'Préstamos con garantía hipotecaria', 'pasivo', 'acreedora'),
            ('3', '3101', 'Capital Social', 'Aportes de los socios', 'patrimonio', 'acreedora'),
            ('3', '3102', 'Reserva Legal', 'Reserva legal según Ley 479-08', 'patrimonio', 'acreedora'),
            ('3', '3103', 'Resultados Acumulados', 'Utilidades o pérdidas de ejercicios anteriores', 'patrimonio', 'acreedora'),
            ('3', '3104', 'Resultado del Ejercicio', 'Utilidad o pérdida del período actual', 'patrimonio', 'acreedora'),
            ('4', '4101', 'Ventas de Mercancías', 'Ingresos por venta de bienes', 'ingreso', 'acreedora'),
            ('4', '4102', 'Prestación de Servicios', 'Ingresos por servicios prestados', 'ingreso', 'acreedora'),
            ('4', '4103', 'Devoluciones sobre Ventas', 'Devoluciones de mercancías vendidas', 'ingreso', 'deudora'),
            ('4', '4104', 'Descuentos sobre Ventas', 'Descuentos concedidos en ventas', 'ingreso', 'deudora'),
            ('4', '4201', 'Ingresos Financieros', 'Intereses ganados y otros ingresos financieros', 'ingreso', 'acreedora'),
            ('4', '4202', 'Ganancia en Cambio de Divisas', 'Diferencias positivas en cambio de moneda', 'ingreso', 'acreedora'),
            ('5', '5101', 'Costo de Ventas', 'Costo de las mercancías vendidas', 'costo', 'deudora'),
            ('5', '5102', 'Costo de Servicios', 'Costos directos de servicios prestados', 'costo', 'deudora'),
            ('6', '6101', 'Gastos de Personal', 'Sueldos y beneficios a empleados', 'gasto', 'deudora'),
            ('6', '6102', 'Honorarios Profesionales', 'Pagos por servicios profesionales', 'gasto', 'deudora'),
            ('6', '6103', 'Arrendamientos', 'Gastos por alquiler de locales', 'gasto', 'deudora'),
            ('6', '6104', 'Depreciación', 'Gastos por depreciación de activos', 'gasto', 'deudora'),
            ('6', '6105', 'Amortización', 'Gastos por amortización de intangibles', 'gasto', 'deudora'),
            ('6', '6106', 'Reparación y Mantenimiento', 'Gastos de mantenimiento y reparaciones', 'gasto', 'deudora'),
            ('6', '6107', 'Servicios Básicos', 'Energía eléctrica, agua, teléfono, internet', 'gasto', 'deudora'),
            ('6', '6201', 'Intereses Bancarios', 'Intereses pagados a instituciones financieras', 'gasto', 'deudora'),
            ('6', '6202', 'Comisiones Bancarias', 'Comisiones pagadas a bancos', 'gasto', 'deudora'),
            ('6', '6203', 'Pérdida en Cambio de Divisas', 'Diferencias negativas en cambio de moneda', 'gasto', 'deudora'),
            ('6', '6301', 'Impuesto a los Activos', 'Impuesto sobre activos empresariales', 'gasto', 'deudora'),
            ('6', '6302', 'Otros Impuestos y Tasas', 'Otros tributos no recuperables', 'gasto', 'deudora'),
            ('7', '7101', 'Garantías Recibidas', 'Garantías recibidas de terceros', 'cuenta_orden', 'deudora'),
            ('7', '7102', 'Garantías Otorgadas', 'Garantías entregadas a terceros', 'cuenta_orden', 'deudora')
    ) as acc(category_code, code, name, description, type, nature)
    INNER JOIN account_categories cat ON cat.code = acc.category_code
    ON CONFLICT (code) DO NOTHING;
END $$;