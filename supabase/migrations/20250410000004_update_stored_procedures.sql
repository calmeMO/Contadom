-- Script para actualizar funciones almacenadas que hacen referencia a closing_history
-- Contadom - Migración para eliminar referencias a closing_history en stored procedures

-- Actualizar la función generar_asiento_cierre_resultados para eliminar referencias a closing_history
CREATE OR REPLACE FUNCTION generar_asiento_cierre_resultados(
    p_periodo_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_utilidad_neta NUMERIC;
    v_asiento_id UUID;
    v_periodo_anual_id UUID;
    v_codigo_cuenta_resultados TEXT := '3300'; -- Cuenta Resultados del Ejercicio
    v_start_date DATE;
    v_end_date DATE;
    v_ultimo_dia DATE;
    v_first_day_next_year DATE;
    v_descripcion TEXT;
    v_periodo_mensual BOOLEAN;
    v_year INTEGER;
BEGIN
    -- Verificar si es un período mensual o anual
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_periodo_id
    ) INTO v_periodo_mensual;
    
    IF v_periodo_mensual THEN
        -- Obtener fechas y el período anual relacionado
        SELECT start_date, end_date, fiscal_year_id, year
        INTO v_start_date, v_end_date, v_periodo_anual_id, v_year
        FROM monthly_accounting_periods
        WHERE id = p_periodo_id;
    ELSE
        -- Es un período anual
        v_periodo_anual_id := p_periodo_id;
        SELECT start_date, end_date, 
               EXTRACT(YEAR FROM start_date)::INTEGER AS year
        INTO v_start_date, v_end_date, v_year
        FROM accounting_periods
        WHERE id = v_periodo_anual_id;
    END IF;
    
    -- Calcular utilidad neta
    v_utilidad_neta := calcular_utilidad_neta(p_periodo_id);
    
    -- Determinar el último día del período para el asiento de cierre
    v_ultimo_dia := v_end_date;
    v_descripcion := 'Asiento de cierre de resultados - Año Fiscal ' || v_year;
    
    -- Crear asiento de cierre
    v_asiento_id := crear_asiento(
        v_ultimo_dia,
        v_descripcion,
        v_periodo_anual_id,
        p_user_id,
        TRUE,
        'CIERRE-' || v_year
    );
    
    -- Actualizar el asiento como asiento de cierre
    UPDATE journal_entries
    SET is_closing_entry = TRUE,
        closing_entry_type = 'cierre_resultados'
    WHERE id = v_asiento_id;
    
    -- Si la utilidad es positiva
    IF v_utilidad_neta > 0 THEN
        -- Cerrar cuentas de ingreso (crédito a cuentas de ingreso)
        PERFORM agregar_linea_asiento(
            v_asiento_id,
            '4000', -- Cuenta general de ingresos
            'Cierre de ingresos del ejercicio',
            v_utilidad_neta,
            0,
            p_user_id
        );
        
        -- Trasladar utilidad al patrimonio (débito a resultados)
        PERFORM agregar_linea_asiento(
            v_asiento_id,
            v_codigo_cuenta_resultados,
            'Traslado de utilidad del ejercicio',
            0,
            v_utilidad_neta,
            p_user_id
        );
    ELSE
        -- En caso de pérdida (utilidad negativa)
        PERFORM agregar_linea_asiento(
            v_asiento_id,
            v_codigo_cuenta_resultados,
            'Traslado de pérdida del ejercicio',
            ABS(v_utilidad_neta),
            0,
            p_user_id
        );
        
        -- Cerrar cuentas de gastos y costos
        PERFORM agregar_linea_asiento(
            v_asiento_id,
            '4000', -- Cuenta general de ingresos
            'Cierre de resultados del ejercicio',
            0,
            ABS(v_utilidad_neta),
            p_user_id
        );
    END IF;
    
    -- Ya no se registra en closing_history
    
    RETURN v_asiento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar la función generar_asiento_apertura para eliminar referencias a closing_history
CREATE OR REPLACE FUNCTION generar_asiento_apertura(
    p_anio_fiscal_id UUID,
    p_periodo_apertura_id UUID,
    p_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_asiento_id UUID;
    v_anio_fiscal_id UUID;
    v_periodo_apertura_anual_id UUID;
    v_periodo_apertura_mensual_id UUID;
    v_periodo_mensual BOOLEAN;
    v_year_actual INTEGER;
    v_year_siguiente INTEGER;
    v_primer_dia_apertura DATE;
    v_descripcion TEXT;
    v_ultimo_periodo_mensual_id UUID;
BEGIN
    -- Verificar si el período de apertura es mensual o anual
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_periodo_apertura_id
    ) INTO v_periodo_mensual;
    
    IF v_periodo_mensual THEN
        -- Obtener datos del período de apertura mensual
        SELECT fiscal_year_id, year, start_date
        INTO v_periodo_apertura_anual_id, v_year_siguiente, v_primer_dia_apertura
        FROM monthly_accounting_periods
        WHERE id = p_periodo_apertura_id;
        
        -- Usar el período mensual seleccionado para la apertura
        v_periodo_apertura_mensual_id := p_periodo_apertura_id;
    ELSE
        -- El período de apertura es anual, buscar su primer período mensual
        v_periodo_apertura_anual_id := p_periodo_apertura_id;
        
        SELECT start_date, EXTRACT(YEAR FROM start_date)::INTEGER
        INTO v_primer_dia_apertura, v_year_siguiente
        FROM accounting_periods
        WHERE id = v_periodo_apertura_anual_id;
        
        -- Buscar el primer período mensual del año de apertura
        SELECT id INTO v_periodo_apertura_mensual_id
        FROM monthly_accounting_periods
        WHERE fiscal_year_id = v_periodo_apertura_anual_id
        AND month = 1
        LIMIT 1;
    END IF;
    
    -- Obtener el último período mensual del año que se cierra
    SELECT id INTO v_ultimo_periodo_mensual_id
    FROM monthly_accounting_periods
    WHERE fiscal_year_id = p_anio_fiscal_id
    ORDER BY month DESC
    LIMIT 1;
    
    -- Si no hay períodos mensuales, usar el año fiscal directamente
    IF v_ultimo_periodo_mensual_id IS NULL THEN
        v_ultimo_periodo_mensual_id := p_anio_fiscal_id;
    END IF;
    
    -- Descripción del asiento de apertura
    v_descripcion := 'Asiento de apertura - Año Fiscal ' || v_year_siguiente;
    
    -- Crear asiento de apertura en el primer día del período de apertura
    v_asiento_id := crear_asiento(
        v_primer_dia_apertura,
        v_descripcion,
        v_periodo_apertura_anual_id,
        p_user_id,
        TRUE,
        'APERTURA-' || v_year_siguiente
    );
    
    -- Actualizar el asiento como asiento de apertura
    UPDATE journal_entries
    SET is_opening_entry = TRUE,
        monthly_period_id = v_periodo_apertura_mensual_id
    WHERE id = v_asiento_id;
    
    -- Generar las líneas del asiento de apertura (saldos iniciales)
    -- Se transfieren los saldos FINALES del último período del año anterior
    
    -- Activos (saldos deudores)
    INSERT INTO journal_entry_items (
        id, journal_entry_id, account_id, description, debit, credit, created_at, created_by, updated_at
    )
    SELECT 
        uuid_generate_v4(), v_asiento_id, a.id, 
        'Saldo inicial ' || a.name, 
        CASE WHEN saldo > 0 THEN saldo ELSE 0 END,
        CASE WHEN saldo < 0 THEN ABS(saldo) ELSE 0 END,
        NOW(), p_user_id, NOW()
    FROM (
        SELECT 
            a.id,
            a.name,
            COALESCE(SUM(
                CASE 
                    WHEN a.type = 'activo' THEN jei.debit - jei.credit
                    ELSE 0
                END
            ), 0) AS saldo
        FROM 
            accounts a
        LEFT JOIN journal_entry_items jei ON jei.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jei.journal_entry_id
        WHERE 
            a.type = 'activo'
            AND a.is_active = TRUE
            AND je.is_approved = TRUE
            AND (
                je.accounting_period_id = p_anio_fiscal_id
                OR 
                (je.monthly_period_id = v_ultimo_periodo_mensual_id)
            )
        GROUP BY 
            a.id, a.name
        HAVING 
            COALESCE(SUM(
                CASE 
                    WHEN a.type = 'activo' THEN jei.debit - jei.credit
                    ELSE 0
                END
            ), 0) <> 0
    ) AS a;
    
    -- Pasivos y Patrimonio (saldos acreedores)
    INSERT INTO journal_entry_items (
        id, journal_entry_id, account_id, description, debit, credit, created_at, created_by, updated_at
    )
    SELECT 
        uuid_generate_v4(), v_asiento_id, a.id, 
        'Saldo inicial ' || a.name, 
        CASE WHEN saldo < 0 THEN ABS(saldo) ELSE 0 END,
        CASE WHEN saldo > 0 THEN saldo ELSE 0 END,
        NOW(), p_user_id, NOW()
    FROM (
        SELECT 
            a.id,
            a.name,
            COALESCE(SUM(
                CASE 
                    WHEN a.type IN ('pasivo', 'patrimonio') THEN jei.credit - jei.debit
                    ELSE 0
                END
            ), 0) AS saldo
        FROM 
            accounts a
        LEFT JOIN journal_entry_items jei ON jei.account_id = a.id
        LEFT JOIN journal_entries je ON je.id = jei.journal_entry_id
        WHERE 
            a.type IN ('pasivo', 'patrimonio')
            AND a.is_active = TRUE
            AND je.is_approved = TRUE
            AND (
                je.accounting_period_id = p_anio_fiscal_id
                OR 
                (je.monthly_period_id = v_ultimo_periodo_mensual_id)
            )
        GROUP BY 
            a.id, a.name
        HAVING 
            COALESCE(SUM(
                CASE 
                    WHEN a.type IN ('pasivo', 'patrimonio') THEN jei.credit - jei.debit
                    ELSE 0
                END
            ), 0) <> 0
    ) AS a;
    
    -- Actualizar totales en el asiento
    UPDATE journal_entries
    SET 
        total_debit = (SELECT COALESCE(SUM(debit), 0) FROM journal_entry_items WHERE journal_entry_id = v_asiento_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM journal_entry_items WHERE journal_entry_id = v_asiento_id)
    WHERE id = v_asiento_id;
    
    -- Ya no se registra en closing_history
    
    RETURN v_asiento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar la función consultar_estado_cierre para eliminar referencias a closing_history
CREATE OR REPLACE FUNCTION consultar_estado_cierre(
    p_periodo_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_resultado JSONB;
    v_periodo_info RECORD;
    v_es_periodo_mensual BOOLEAN;
    v_puede_reabrir BOOLEAN;
    v_dias_desde_cierre INTEGER;
BEGIN
    -- Determinar si es período mensual o anual
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_periodo_id
    ) INTO v_es_periodo_mensual;
    
    -- Obtener información del período
    IF v_es_periodo_mensual THEN
        SELECT m.*, 
               u1.email AS created_by_email,
               u2.email AS closed_by_email,
               u3.email AS reopened_by_email
        INTO v_periodo_info
        FROM monthly_accounting_periods m
        LEFT JOIN user_profiles u1 ON u1.id = m.created_by
        LEFT JOIN user_profiles u2 ON u2.id = m.closed_by
        LEFT JOIN user_profiles u3 ON u3.id = m.reopened_by
        WHERE m.id = p_periodo_id;
    ELSE
        SELECT p.*, 
               u1.email AS created_by_email,
               u2.email AS closed_by_email,
               u3.email AS reopened_by_email
        INTO v_periodo_info
        FROM accounting_periods p
        LEFT JOIN user_profiles u1 ON u1.id = p.created_by
        LEFT JOIN user_profiles u2 ON u2.id = p.closed_by
        LEFT JOIN user_profiles u3 ON u3.id = p.reopened_by
        WHERE p.id = p_periodo_id;
    END IF;
    
    -- Verificar si se puede reabrir (dentro de 90 días)
    IF v_periodo_info.is_closed THEN
        v_dias_desde_cierre := EXTRACT(DAY FROM (NOW() - v_periodo_info.closed_at));
        v_puede_reabrir := (v_dias_desde_cierre <= 90);
    ELSE
        v_puede_reabrir := FALSE;
        v_dias_desde_cierre := NULL;
    END IF;
    
    -- Construir respuesta
    v_resultado := jsonb_build_object(
        'periodo', jsonb_build_object(
            'id', v_periodo_info.id,
            'nombre', v_periodo_info.name,
            'fecha_inicio', v_periodo_info.start_date,
            'fecha_fin', v_periodo_info.end_date,
            'esta_cerrado', v_periodo_info.is_closed,
            'fecha_cierre', v_periodo_info.closed_at,
            'cerrado_por', v_periodo_info.closed_by_email,
            'esta_reabierto', v_periodo_info.is_reopened,
            'fecha_reapertura', v_periodo_info.reopened_at,
            'reabierto_por', v_periodo_info.reopened_by_email,
            'puede_reabrir', v_puede_reabrir,
            'dias_desde_cierre', v_dias_desde_cierre
        )
    );
    
    RETURN v_resultado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar la función reabrir_periodo_contable para eliminar referencias a closing_history
CREATE OR REPLACE FUNCTION reabrir_periodo_contable(
    p_anio_fiscal_id UUID,
    p_user_id UUID,
    p_notas TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_estado JSONB;
    v_cerrado_hace_dias INTEGER;
    v_anio_info RECORD;
    v_periodo_mensual BOOLEAN;
BEGIN
    -- Verificar permisos del usuario
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = p_user_id 
        AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Solo un administrador puede reabrir un año fiscal',
            'error', 'UNAUTHORIZED'
        );
    END IF;
    
    -- Determinar si es período mensual o anual
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_anio_fiscal_id
    ) INTO v_periodo_mensual;
    
    IF v_periodo_mensual THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'El ID proporcionado corresponde a un período mensual, no a un año fiscal',
            'error', 'INVALID_FISCAL_YEAR_ID'
        );
    END IF;
    
    -- Obtener información del año fiscal
    SELECT *
    INTO v_anio_info
    FROM accounting_periods
    WHERE id = p_anio_fiscal_id;
    
    -- Verificar si el año fiscal está cerrado
    IF NOT v_anio_info.is_closed THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'El año fiscal no está cerrado',
            'error', 'NOT_CLOSED'
        );
    END IF;
    
    -- Calcular días desde el cierre
    v_cerrado_hace_dias := EXTRACT(DAY FROM (NOW() - v_anio_info.closed_at));
    
    -- Verificar límite de 90 días
    IF v_cerrado_hace_dias > 90 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No se puede reabrir el año fiscal. Han pasado más de 90 días desde su cierre.',
            'error', 'TIME_LIMIT_EXCEEDED'
        );
    END IF;
    
    -- Primero reabrir todos los períodos mensuales
    UPDATE monthly_accounting_periods
    SET is_closed = FALSE,
        is_reopened = TRUE,
        reopened_at = NOW(),
        reopened_by = p_user_id,
        notes = COALESCE(notes, '') || ' | Reabierto el ' || NOW() || ': ' || COALESCE(p_notas, 'Reapertura del año fiscal')
    WHERE fiscal_year_id = p_anio_fiscal_id;
    
    -- Luego reabrir el año fiscal
    UPDATE accounting_periods
    SET is_closed = FALSE,
        is_reopened = TRUE,
        reopened_at = NOW(),
        reopened_by = p_user_id,
        notes = COALESCE(notes, '') || ' | Reabierto el ' || NOW() || ': ' || COALESCE(p_notas, 'Sin notas adicionales')
    WHERE id = p_anio_fiscal_id;
    
    -- Ya no se registra en closing_history
    
    -- Crear respuesta
    v_estado := jsonb_build_object(
        'success', TRUE,
        'message', 'Año fiscal reabierto exitosamente',
        'data', jsonb_build_object(
            'anio_fiscal', v_anio_info.name,
            'reabierto_en', NOW(),
            'dias_desde_cierre', v_cerrado_hace_dias
        )
    );
    
    RETURN v_estado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar función cerrar_periodo_contable
CREATE OR REPLACE FUNCTION cerrar_periodo_contable(
    p_anio_fiscal_id UUID,
    p_periodo_apertura_id UUID,
    p_user_id UUID,
    p_cerrar_periodo BOOLEAN DEFAULT TRUE,
    p_generar_apertura BOOLEAN DEFAULT TRUE
) RETURNS JSONB AS $$
DECLARE
    v_estado JSONB;
    v_asientos_completos BOOLEAN;
    v_utilidad_neta NUMERIC;
    v_asiento_cierre_id UUID;
    v_asiento_apertura_id UUID;
    v_anio_info RECORD;
    v_periodo_apertura_info RECORD;
    v_periodos_mensuales_cerrados BOOLEAN;
    v_periodo_mensual BOOLEAN;
    v_anio_siguiente_id UUID;
    v_user_role TEXT;
    v_user_id_uuid UUID;
    v_user_email TEXT;
    v_perfil_usuario JSONB;
BEGIN
    -- Intentar convertir el ID de usuario a UUID
    BEGIN
        v_user_id_uuid := p_user_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'ID de usuario inválido: %', p_user_id;
    END;
    
    -- Verificar y sincronizar perfil de usuario (con role='accountant' como default)
    v_perfil_usuario := verificar_sincronizar_perfil_usuario(p_user_id, 'accountant');
    
    -- Verificar si la sincronización fue exitosa
    IF NOT (v_perfil_usuario->>'success')::BOOLEAN THEN
        RAISE EXCEPTION 'Error al verificar perfil: %', v_perfil_usuario->>'message';
    END IF;
    
    -- Extraer el rol del usuario del resultado de la sincronización
    v_user_role := (v_perfil_usuario->'data'->>'role');
    
    -- Verificar permisos del usuario
    IF v_user_role NOT IN ('admin', 'accountant') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'No tiene permisos para realizar esta operación',
            'error', 'UNAUTHORIZED'
        );
    END IF;
    
    -- Verificar que el ID proporcionado sea de un año fiscal, no un período mensual
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_anio_fiscal_id
    ) INTO v_periodo_mensual;
    
    IF v_periodo_mensual THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'El ID proporcionado corresponde a un período mensual, no a un año fiscal',
            'error', 'INVALID_FISCAL_YEAR_ID'
        );
    END IF;
    
    -- Obtener información del año fiscal
    SELECT *
    INTO v_anio_info
    FROM accounting_periods
    WHERE id = p_anio_fiscal_id;
    
    -- Verificar que sea un período anual
    IF v_anio_info.is_month THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'El ID proporcionado no corresponde a un año fiscal',
            'error', 'NOT_FISCAL_YEAR'
        );
    END IF;
    
    -- Obtener información del período de apertura
    SELECT EXISTS (
        SELECT 1 FROM monthly_accounting_periods WHERE id = p_periodo_apertura_id
    ) INTO v_periodo_mensual;
    
    IF v_periodo_mensual THEN
        SELECT m.*, ap.id AS fiscal_year_id
        INTO v_periodo_apertura_info
        FROM monthly_accounting_periods m
        JOIN accounting_periods ap ON ap.id = m.fiscal_year_id
        WHERE m.id = p_periodo_apertura_id;
        
        v_anio_siguiente_id := v_periodo_apertura_info.fiscal_year_id;
    ELSE
        -- Si no es un período mensual, debe ser un año fiscal
        SELECT *
        INTO v_periodo_apertura_info
        FROM accounting_periods
        WHERE id = p_periodo_apertura_id;
        
        v_anio_siguiente_id := p_periodo_apertura_id;
    END IF;
    
    -- Verificar que todos los asientos del año fiscal estén completos y aprobados
    v_asientos_completos := verificar_asientos_periodo(p_anio_fiscal_id);
    
    IF NOT v_asientos_completos THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'message', 'Existen asientos contables pendientes o no balanceados en el año fiscal',
            'error', 'INCOMPLETE_ENTRIES'
        );
    END IF;
    
    -- Calcular la utilidad neta del año fiscal
    v_utilidad_neta := calcular_utilidad_neta(p_anio_fiscal_id);
    
    -- Generar asiento de cierre de resultados para el año fiscal
    v_asiento_cierre_id := generar_asiento_cierre_resultados(p_anio_fiscal_id, v_user_id_uuid);
    
    -- Generar asiento de apertura si se solicitó
    IF p_generar_apertura THEN
        v_asiento_apertura_id := generar_asiento_apertura(p_anio_fiscal_id, p_periodo_apertura_id, v_user_id_uuid);
    END IF;
    
    -- Cerrar todos los períodos mensuales si se solicitó cerrar el período
    IF p_cerrar_periodo THEN
        -- Primero cerrar todos los períodos mensuales
        v_periodos_mensuales_cerrados := cerrar_periodos_mensuales_del_anio(p_anio_fiscal_id, v_user_id_uuid);
        
        -- Luego cerrar el año fiscal
        UPDATE accounting_periods
        SET is_closed = TRUE,
            closed_at = NOW(),
            closed_by = v_user_id_uuid
        WHERE id = p_anio_fiscal_id;
    END IF;
    
    -- Crear respuesta
    v_estado := jsonb_build_object(
        'success', TRUE,
        'message', 'Proceso de cierre del año fiscal completado exitosamente',
        'data', jsonb_build_object(
            'anio_fiscal', v_anio_info.name,
            'periodo_apertura', v_periodo_apertura_info.name,
            'utilidad_neta', v_utilidad_neta,
            'asiento_cierre_id', v_asiento_cierre_id,
            'asiento_apertura_id', COALESCE(v_asiento_apertura_id, NULL),
            'anio_fiscal_cerrado', p_cerrar_periodo,
            'apertura_generada', p_generar_apertura
        )
    );
    
    RETURN v_estado;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 