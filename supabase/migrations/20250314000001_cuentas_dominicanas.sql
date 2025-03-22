/*
  # Cuentas Contables Estándar para República Dominicana
  
  Este archivo añade cuentas contables estándar basadas en el sistema contable
  dominicano y las normas NIIF adaptadas en República Dominicana.
*/

-- Obtener el ID del primer usuario administrador
DO $$ 
DECLARE
    admin_id UUID;
BEGIN
    SELECT id INTO admin_id FROM user_profiles WHERE role = 'admin' LIMIT 1;
    
    -- Cuentas de Activos Corrientes
    INSERT INTO accounts (id, category_id, parent_id, code, name, description, type, is_active, created_at, created_by, updated_at)
    VALUES
      -- Efectivo y Equivalentes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1101', 'Efectivo en Caja', 'Dinero en efectivo disponible', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1102', 'Efectivo en Bancos', 'Depósitos en cuentas bancarias', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1103', 'Equivalentes de Efectivo', 'Inversiones a corto plazo de alta liquidez', 'activo_corriente', true, now(), admin_id, now()),
      
      -- Cuentas por Cobrar
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1201', 'Cuentas por Cobrar Comerciales', 'Derechos de cobro a clientes', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1202', 'Provisión para Cuentas Incobrables', 'Estimación de pérdidas por incobrabilidad', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1203', 'Anticipos a Proveedores', 'Pagos anticipados a proveedores', 'activo_corriente', true, now(), admin_id, now()),
      
      -- Inventarios
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1301', 'Inventario de Mercancías', 'Bienes disponibles para la venta', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1302', 'Inventario de Materias Primas', 'Materiales para producción', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1303', 'Productos en Proceso', 'Productos en fase de producción', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1304', 'Productos Terminados', 'Productos listos para la venta', 'activo_corriente', true, now(), admin_id, now()),
      
      -- Activos por Impuestos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1401', 'ITBIS por Acreditar', 'Impuesto a las Transferencias de Bienes Industrializados y Servicios', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1402', 'Anticipos de Impuesto Sobre la Renta', 'Pagos anticipados de ISR', 'activo_corriente', true, now(), admin_id, now()),
      
      -- Gastos Pagados por Anticipado
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1501', 'Seguros Pagados por Anticipado', 'Primas de seguros pagadas por adelantado', 'activo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '1502', 'Alquileres Pagados por Anticipado', 'Alquileres pagados por adelantado', 'activo_corriente', true, now(), admin_id, now()),
      
      -- Activos No Corrientes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1601', 'Terrenos', 'Valor de los terrenos propiedad de la empresa', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1602', 'Edificios', 'Valor de las edificaciones propiedad de la empresa', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1603', 'Depreciación Acumulada Edificios', 'Depreciación acumulada de edificios', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1604', 'Vehículos', 'Vehículos propiedad de la empresa', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1605', 'Depreciación Acumulada Vehículos', 'Depreciación acumulada de vehículos', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1606', 'Mobiliario y Equipo de Oficina', 'Mobiliario y equipo utilizados en oficinas', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1607', 'Depreciación Acumulada Mobiliario', 'Depreciación acumulada de mobiliario', 'activo_no_corriente', true, now(), admin_id, now()),
      
      -- Activos Intangibles
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1701', 'Software', 'Programas informáticos adquiridos', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1702', 'Amortización Acumulada Software', 'Amortización acumulada de software', 'activo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '1703', 'Marcas y Patentes', 'Valor de las marcas y patentes registradas', 'activo_no_corriente', true, now(), admin_id, now()),
      
      -- Pasivos Corrientes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2101', 'Proveedores Locales', 'Deudas con proveedores locales', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2102', 'Proveedores del Exterior', 'Deudas con proveedores extranjeros', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2103', 'Préstamos Bancarios a Corto Plazo', 'Préstamos con vencimiento menor a un año', 'pasivo_corriente', true, now(), admin_id, now()),
      
      -- Impuestos por Pagar
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2201', 'ITBIS por Pagar', 'Impuesto por transferencias de bienes y servicios', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2202', 'Impuesto Sobre la Renta por Pagar', 'ISR pendiente de pago', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2203', 'Retenciones ISR por Pagar', 'Retenciones de ISR a terceros', 'pasivo_corriente', true, now(), admin_id, now()),
      
      -- Obligaciones Laborales
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2301', 'Sueldos por Pagar', 'Remuneraciones pendientes de pago', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2302', 'TSS por Pagar', 'Tesorería de la Seguridad Social pendiente', 'pasivo_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '2303', 'AFP por Pagar', 'Aportes a fondos de pensiones', 'pasivo_corriente', true, now(), admin_id, now()),
      
      -- Pasivos No Corrientes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '2401', 'Préstamos Bancarios a Largo Plazo', 'Préstamos con vencimiento mayor a un año', 'pasivo_no_corriente', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '2402', 'Hipotecas por Pagar', 'Préstamos con garantía hipotecaria', 'pasivo_no_corriente', true, now(), admin_id, now()),
      
      -- Patrimonio
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '3'), NULL, '3101', 'Capital Social', 'Aportes de los socios', 'patrimonio', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '3'), NULL, '3102', 'Reserva Legal', 'Reserva legal según Ley 479-08', 'patrimonio', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '3'), NULL, '3103', 'Resultados Acumulados', 'Utilidades o pérdidas de ejercicios anteriores', 'patrimonio', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '3'), NULL, '3104', 'Resultado del Ejercicio', 'Utilidad o pérdida del período actual', 'patrimonio', true, now(), admin_id, now()),
      
      -- Ingresos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4101', 'Ventas de Mercancías', 'Ingresos por venta de bienes', 'ingreso', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4102', 'Prestación de Servicios', 'Ingresos por servicios prestados', 'ingreso', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4103', 'Devoluciones sobre Ventas', 'Devoluciones de mercancías vendidas', 'ingreso', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4104', 'Descuentos sobre Ventas', 'Descuentos concedidos en ventas', 'ingreso', true, now(), admin_id, now()),
      
      -- Otros Ingresos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4201', 'Ingresos Financieros', 'Intereses ganados y otros ingresos financieros', 'ingreso', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '4'), NULL, '4202', 'Ganancia en Cambio de Divisas', 'Diferencias positivas en cambio de moneda', 'ingreso', true, now(), admin_id, now()),
      
      -- Costos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '5'), NULL, '5101', 'Costo de Ventas', 'Costo de las mercancías vendidas', 'costo', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '5'), NULL, '5102', 'Costo de Servicios', 'Costos directos de servicios prestados', 'costo', true, now(), admin_id, now()),
      
      -- Gastos Operativos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6101', 'Gastos de Personal', 'Sueldos y beneficios a empleados', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6102', 'Honorarios Profesionales', 'Pagos por servicios profesionales', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6103', 'Arrendamientos', 'Gastos por alquiler de locales', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6104', 'Depreciación', 'Gastos por depreciación de activos', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6105', 'Amortización', 'Gastos por amortización de intangibles', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6106', 'Reparación y Mantenimiento', 'Gastos de mantenimiento y reparaciones', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6107', 'Servicios Básicos', 'Energía eléctrica, agua, teléfono, internet', 'gasto', true, now(), admin_id, now()),
      
      -- Gastos Financieros
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6201', 'Intereses Bancarios', 'Intereses pagados a instituciones financieras', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6202', 'Comisiones Bancarias', 'Comisiones pagadas a bancos', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6203', 'Pérdida en Cambio de Divisas', 'Diferencias negativas en cambio de moneda', 'gasto', true, now(), admin_id, now()),
      
      -- Gastos de Impuestos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6301', 'Impuesto a los Activos', 'Impuesto sobre activos empresariales', 'gasto', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '6'), NULL, '6302', 'Otros Impuestos y Tasas', 'Otros tributos no recuperables', 'gasto', true, now(), admin_id, now()),
      
      -- Cuentas de Orden
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '7'), NULL, '7101', 'Garantías Recibidas', 'Garantías recibidas de terceros', 'cuenta_orden', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '7'), NULL, '7102', 'Garantías Otorgadas', 'Garantías entregadas a terceros', 'cuenta_orden', true, now(), admin_id, now())
    ON CONFLICT (code) DO NOTHING;
END $$; 