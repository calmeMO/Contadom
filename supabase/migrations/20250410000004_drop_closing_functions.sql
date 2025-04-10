-- Script para eliminar las funciones de cierre contable
-- Contadom - Migración para eliminar funciones de cierre

-- Eliminar todas las funciones relacionadas con cierre contable
DROP FUNCTION IF EXISTS public.generar_asiento_cierre_resultados(UUID, UUID);
DROP FUNCTION IF EXISTS public.generar_asiento_apertura(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS public.reabrir_periodo_contable(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.consultar_estado_cierre(UUID);
DROP FUNCTION IF EXISTS public.cerrar_periodo_contable(UUID, UUID, UUID, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.cerrar_periodos_mensuales_del_anio(UUID, UUID);
DROP FUNCTION IF EXISTS public.calcular_utilidad_neta(UUID);
DROP FUNCTION IF EXISTS public.verificar_asientos_periodo(UUID);

-- Confirmar eliminación
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname IN (
            'generar_asiento_cierre_resultados',
            'generar_asiento_apertura',
            'reabrir_periodo_contable',
            'consultar_estado_cierre',
            'cerrar_periodo_contable',
            'cerrar_periodos_mensuales_del_anio',
            'calcular_utilidad_neta',
            'verificar_asientos_periodo'
        )
    ) THEN
        RAISE NOTICE 'Todas las funciones de cierre contable han sido eliminadas correctamente';
    ELSE
        RAISE WARNING 'Algunas funciones de cierre contable podrían no haberse eliminado correctamente';
    END IF;
END;
$$; 