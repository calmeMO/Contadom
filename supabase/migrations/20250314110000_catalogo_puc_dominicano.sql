/*
  # Catálogo de Cuentas según PUC de República Dominicana
  
  Este archivo crea un catálogo de cuentas completo basado en el 
  Plan Único de Cuentas (PUC) de República Dominicana.
*/

-- Obtener el ID del primer usuario administrador
DO $$ 
DECLARE
    admin_id UUID;
BEGIN
    SELECT id INTO admin_id FROM user_profiles WHERE role = 'admin' LIMIT 1;
    
    -- Primero creamos las categorías principales según PUC dominicano
    INSERT INTO account_categories (id, code, name, description, created_at, created_by, updated_at)
    VALUES
      (gen_random_uuid(), '1', 'Activos', 'Recursos controlados por la entidad', now(), admin_id, now()),
      (gen_random_uuid(), '2', 'Pasivos', 'Obligaciones presentes de la entidad', now(), admin_id, now()),
      (gen_random_uuid(), '3', 'Patrimonio', 'Participación residual en los activos de la entidad', now(), admin_id, now()),
      (gen_random_uuid(), '4', 'Ingresos', 'Incrementos en los beneficios económicos', now(), admin_id, now()),
      (gen_random_uuid(), '5', 'Costos', 'Decrementos por las operaciones de producción o comercialización', now(), admin_id, now()),
      (gen_random_uuid(), '6', 'Gastos', 'Decrementos en los beneficios económicos', now(), admin_id, now()),
      (gen_random_uuid(), '7', 'Cuentas de Orden Deudoras', 'Cuentas de registro y control deudoras', now(), admin_id, now()),
      (gen_random_uuid(), '8', 'Cuentas de Orden Acreedoras', 'Cuentas de registro y control acreedoras', now(), admin_id, now())
    ON CONFLICT (code) DO NOTHING;
    
    -- Ahora creamos subcategorías para mayor organización
    INSERT INTO account_categories (id, code, name, description, created_at, created_by, updated_at)
    VALUES
      -- Activos
      (gen_random_uuid(), '11', 'Activos Corrientes', 'Activos que se espera realizar en el ciclo normal de operación', now(), admin_id, now()),
      (gen_random_uuid(), '12', 'Activos No Corrientes', 'Activos de largo plazo', now(), admin_id, now()),
      
      -- Pasivos
      (gen_random_uuid(), '21', 'Pasivos Corrientes', 'Obligaciones a liquidar en el ciclo normal de operación', now(), admin_id, now()),
      (gen_random_uuid(), '22', 'Pasivos No Corrientes', 'Obligaciones a largo plazo', now(), admin_id, now()),
      
      -- Patrimonio
      (gen_random_uuid(), '31', 'Capital Social', 'Aportes de los socios o accionistas', now(), admin_id, now()),
      (gen_random_uuid(), '32', 'Reservas', 'Apropiaciones de utilidades', now(), admin_id, now()),
      (gen_random_uuid(), '33', 'Resultados', 'Resultados del ejercicio y acumulados', now(), admin_id, now()),
      
      -- Ingresos
      (gen_random_uuid(), '41', 'Ingresos Operacionales', 'Ingresos relacionados con la actividad principal', now(), admin_id, now()),
      (gen_random_uuid(), '42', 'Ingresos No Operacionales', 'Ingresos no relacionados con la actividad principal', now(), admin_id, now()),
      
      -- Costos
      (gen_random_uuid(), '51', 'Costos de Ventas', 'Costos asociados a la generación de ingresos', now(), admin_id, now()),
      (gen_random_uuid(), '52', 'Costos de Producción', 'Costos del proceso productivo', now(), admin_id, now()),
      
      -- Gastos
      (gen_random_uuid(), '61', 'Gastos Operacionales', 'Gastos relacionados con la actividad principal', now(), admin_id, now()),
      (gen_random_uuid(), '62', 'Gastos No Operacionales', 'Gastos no relacionados con la actividad principal', now(), admin_id, now()),
      (gen_random_uuid(), '63', 'Impuestos', 'Gastos por impuestos', now(), admin_id, now())
    ON CONFLICT (code) DO NOTHING;
    
    -- Ahora insertamos las cuentas según el PUC dominicano
    INSERT INTO accounts (id, category_id, parent_id, code, name, description, type, nature, is_active, created_at, created_by, updated_at)
    VALUES
      -- ACTIVOS
      -- Efectivo y Equivalentes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110101', 'Caja General', 'Fondos en efectivo disponibles', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110102', 'Caja Chica', 'Fondos para gastos menores', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110201', 'Banco Popular Dominicano Cta. Cte.', 'Cuenta corriente en BPD', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110202', 'Banreservas Cta. Cte.', 'Cuenta corriente en Banreservas', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110301', 'Inversiones Temporales', 'Instrumentos financieros a corto plazo', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- Cuentas por Cobrar
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110401', 'Cuentas por Cobrar Clientes', 'Créditos comerciales a clientes', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110402', 'Provisión para Cuentas Incobrables', 'Estimación para cuentas de dudoso cobro', 'activo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110403', 'Cuentas por Cobrar Empleados', 'Adelantos y préstamos a empleados', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110404', 'Anticipo a Proveedores', 'Pagos anticipados a proveedores', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- Inventarios
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110501', 'Inventario de Mercancías', 'Mercancías disponibles para la venta', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110502', 'Inventario de Materia Prima', 'Materiales para producción', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110503', 'Inventario de Productos en Proceso', 'Productos en fase de fabricación', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110504', 'Inventario de Productos Terminados', 'Productos listos para la venta', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110505', 'Mercancías en Tránsito', 'Mercancías adquiridas pendientes de recepción', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- Impuestos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110601', 'ITBIS Pagado', 'Impuesto sobre Transferencias de Bienes y Servicios pagado', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110602', 'Anticipos de ISR', 'Anticipos de Impuesto Sobre la Renta', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110603', 'Retenciones de ISR', 'Retenciones de ISR que nos han efectuado', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- Pagos Anticipados
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110701', 'Seguros Pagados por Anticipado', 'Primas de seguros pagadas por adelantado', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110702', 'Alquileres Pagados por Anticipado', 'Alquileres pagados por adelantado', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '11'), NULL, '110703', 'Intereses Pagados por Anticipado', 'Intereses pagados por adelantado', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- Activos No Corrientes - Propiedad, Planta y Equipo
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120101', 'Terrenos', 'Terrenos propiedad de la empresa', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120102', 'Edificaciones', 'Edificaciones propiedad de la empresa', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120103', 'Depreciación Acumulada Edificaciones', 'Depreciación acumulada de edificaciones', 'activo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120104', 'Mobiliario y Equipo de Oficina', 'Mobiliario y equipo utilizado en oficinas', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120105', 'Depreciación Acumulada Mobiliario', 'Depreciación acumulada de mobiliario', 'activo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120106', 'Equipo de Transporte', 'Vehículos de la empresa', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120107', 'Depreciación Acumulada Equipo de Transporte', 'Depreciación acumulada de vehículos', 'activo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120108', 'Maquinaria y Equipo', 'Maquinaria utilizada en la producción', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120109', 'Depreciación Acumulada Maquinaria', 'Depreciación acumulada de maquinaria', 'activo', 'acreedora', true, now(), admin_id, now()),
      
      -- Activos Intangibles
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120201', 'Software', 'Programas informáticos', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120202', 'Amortización Acumulada Software', 'Amortización acumulada de software', 'activo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120203', 'Patentes y Marcas', 'Derechos de propiedad industrial', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120204', 'Amortización Acumulada Patentes', 'Amortización acumulada de patentes', 'activo', 'acreedora', true, now(), admin_id, now()),
      
      -- Inversiones a Largo Plazo
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120301', 'Inversiones en Subsidiarias', 'Inversiones en empresas subsidiarias', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120302', 'Inversiones en Asociadas', 'Inversiones en empresas asociadas', 'activo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '12'), NULL, '120303', 'Otras Inversiones a Largo Plazo', 'Otras inversiones de largo plazo', 'activo', 'deudora', true, now(), admin_id, now()),
      
      -- PASIVOS
      -- Pasivos Corrientes - Cuentas por Pagar
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210101', 'Proveedores Locales', 'Cuentas por pagar a proveedores locales', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210102', 'Proveedores del Exterior', 'Cuentas por pagar a proveedores internacionales', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210103', 'Acreedores Diversos', 'Otras cuentas por pagar', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Préstamos a Corto Plazo
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210201', 'Préstamos Bancarios a Corto Plazo', 'Préstamos bancarios con vencimiento menor a un año', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210202', 'Porción Corriente Préstamos a Largo Plazo', 'Porción a corto plazo de préstamos a largo plazo', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Impuestos por Pagar
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210301', 'ITBIS por Pagar', 'Impuesto sobre Transferencias de Bienes y Servicios', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210302', 'ISR por Pagar', 'Impuesto Sobre la Renta por pagar', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210303', 'Retenciones ISR por Pagar', 'Retenciones de ISR efectuadas', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Obligaciones Laborales
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210401', 'Sueldos por Pagar', 'Remuneraciones pendientes de pago', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210402', 'Seguridad Social por Pagar', 'Aportes a la TSS pendientes', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210403', 'AFP por Pagar', 'Aportes a fondos de pensiones', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210404', 'Vacaciones por Pagar', 'Provisión de vacaciones', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210405', 'Regalía Pascual por Pagar', 'Provisión para regalía pascual', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Anticipos de Clientes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '21'), NULL, '210501', 'Anticipos de Clientes', 'Pagos recibidos por adelantado', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Pasivos No Corrientes
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '220101', 'Préstamos Bancarios a Largo Plazo', 'Préstamos con vencimiento mayor a un año', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '220102', 'Hipotecas por Pagar', 'Préstamos con garantía hipotecaria', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- Provisiones a Largo Plazo
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '220201', 'Provisión para Indemnizaciones', 'Provisión para indemnizaciones laborales', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '22'), NULL, '220202', 'Provisión para Litigios', 'Provisión para litigios legales', 'pasivo', 'acreedora', true, now(), admin_id, now()),
      
      -- PATRIMONIO
      -- Capital Social
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '31'), NULL, '310101', 'Capital Social Autorizado', 'Capital social autorizado legalmente', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '31'), NULL, '310102', 'Capital por Suscribir', 'Capital pendiente de suscripción', 'patrimonio', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '31'), NULL, '310103', 'Capital Suscrito y Pagado', 'Capital efectivamente aportado', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      
      -- Reservas
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '32'), NULL, '320101', 'Reserva Legal', 'Reserva del 5% según Ley de Sociedades', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '32'), NULL, '320102', 'Otras Reservas', 'Otras reservas patrimoniales', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      
      -- Resultados
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '33'), NULL, '330101', 'Resultados Acumulados', 'Utilidades o pérdidas de ejercicios anteriores', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '33'), NULL, '330102', 'Resultado del Ejercicio', 'Utilidad o pérdida del período actual', 'patrimonio', 'acreedora', true, now(), admin_id, now()),
      
      -- INGRESOS
      -- Ingresos Operacionales
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '41'), NULL, '410101', 'Ventas de Mercancías', 'Ingresos por venta de bienes', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '41'), NULL, '410102', 'Prestación de Servicios', 'Ingresos por servicios', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '41'), NULL, '410103', 'Comisiones Ganadas', 'Ingresos por comisiones', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      
      -- Devoluciones y Descuentos en Ventas
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '41'), NULL, '410201', 'Devoluciones en Ventas', 'Devoluciones de mercancías vendidas', 'ingreso', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '41'), NULL, '410202', 'Descuentos en Ventas', 'Descuentos concedidos en ventas', 'ingreso', 'deudora', true, now(), admin_id, now()),
      
      -- Ingresos No Operacionales
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '42'), NULL, '420101', 'Ingresos Financieros', 'Intereses ganados en inversiones y depósitos', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '42'), NULL, '420102', 'Ganancias en Cambio de Divisas', 'Diferencias positivas en cambio de moneda', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '42'), NULL, '420103', 'Ganancias en Venta de Activos', 'Utilidad en venta de activos fijos', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '42'), NULL, '420104', 'Otros Ingresos', 'Otros ingresos no operacionales', 'ingreso', 'acreedora', true, now(), admin_id, now()),
      
      -- COSTOS
      -- Costos de Ventas
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '51'), NULL, '510101', 'Costo de Mercancías Vendidas', 'Costo de los productos vendidos', 'costo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '51'), NULL, '510102', 'Costo de Servicios Prestados', 'Costo directo de servicios', 'costo', 'deudora', true, now(), admin_id, now()),
      
      -- Costos de Producción
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '52'), NULL, '520101', 'Materia Prima', 'Costo de materiales utilizados', 'costo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '52'), NULL, '520102', 'Mano de Obra Directa', 'Sueldos y prestaciones de personal de producción', 'costo', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '52'), NULL, '520103', 'Costos Indirectos de Fabricación', 'Costos indirectos del proceso productivo', 'costo', 'deudora', true, now(), admin_id, now()),
      
      -- GASTOS
      -- Gastos de Administración
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610101', 'Sueldos y Compensaciones', 'Sueldos del personal administrativo', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610102', 'Prestaciones Laborales', 'Beneficios al personal', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610103', 'Aportes a la Seguridad Social', 'Contribuciones a la TSS', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610104', 'Servicios Profesionales', 'Honorarios a profesionales', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610105', 'Alquileres', 'Arrendamientos de local y equipos', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610106', 'Energía Eléctrica', 'Consumo de electricidad', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610107', 'Agua', 'Consumo de agua', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610108', 'Teléfono e Internet', 'Servicios de comunicación', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610109', 'Material Gastable', 'Papelería y artículos de oficina', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610110', 'Seguros', 'Gastos de seguros', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610111', 'Depreciación', 'Depreciación de activos fijos', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610112', 'Amortización', 'Amortización de intangibles', 'gasto', 'deudora', true, now(), admin_id, now()),
      
      -- Gastos de Ventas
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610201', 'Sueldos Personal de Ventas', 'Sueldos y comisiones del personal de ventas', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610202', 'Publicidad y Promoción', 'Gastos de publicidad y promoción', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '61'), NULL, '610203', 'Gastos de Transporte', 'Transporte y distribución', 'gasto', 'deudora', true, now(), admin_id, now()),
      
      -- Gastos Financieros
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620101', 'Intereses Bancarios', 'Intereses pagados por préstamos', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620102', 'Comisiones Bancarias', 'Comisiones por servicios bancarios', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620103', 'Pérdidas en Cambio de Divisas', 'Diferencias negativas en cambio de moneda', 'gasto', 'deudora', true, now(), admin_id, now()),
      
      -- Otros Gastos No Operacionales
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620201', 'Pérdidas en Venta de Activos', 'Pérdidas en venta de activos fijos', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620202', 'Donaciones', 'Donaciones realizadas', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '62'), NULL, '620203', 'Otros Gastos', 'Otros gastos no operacionales', 'gasto', 'deudora', true, now(), admin_id, now()),
      
      -- Impuestos
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '63'), NULL, '630101', 'Impuesto Sobre la Renta', 'Provisión de ISR', 'gasto', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '63'), NULL, '630102', 'Impuesto Sobre Activos', 'Impuesto sobre activos empresariales', 'gasto', 'deudora', true, now(), admin_id, now()),
      
      -- Cuentas de Orden
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '7'), NULL, '710101', 'Bienes en Garantía', 'Bienes en garantía de operaciones', 'cuenta_orden', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '7'), NULL, '710102', 'Garantías Recibidas', 'Garantías recibidas de terceros', 'cuenta_orden', 'deudora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '8'), NULL, '810101', 'Contrapartida Bienes en Garantía', 'Contrapartida de bienes en garantía', 'cuenta_orden', 'acreedora', true, now(), admin_id, now()),
      (gen_random_uuid(), (SELECT id FROM account_categories WHERE code = '8'), NULL, '810102', 'Contrapartida Garantías Recibidas', 'Contrapartida de garantías recibidas', 'cuenta_orden', 'acreedora', true, now(), admin_id, now())
    ON CONFLICT (code) DO NOTHING;
END $$; 