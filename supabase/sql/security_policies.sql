-- Políticas de seguridad para Contadom
-- Este archivo define las políticas de Row Level Security (RLS) para proteger los datos

-- Habilitar RLS en las tablas principales
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Política para journal_entries: Solo creador puede ver y editar, excepto admin que puede ver todos
CREATE POLICY "Usuarios pueden ver sus propios asientos contables"
  ON journal_entries
  FOR SELECT
  USING (auth.uid() = created_by OR 
         EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Usuarios pueden insertar sus propios asientos contables"
  ON journal_entries
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuarios pueden actualizar sus propios asientos no aprobados"
  ON journal_entries
  FOR UPDATE
  USING (auth.uid() = created_by AND is_approved = false);

CREATE POLICY "Administradores pueden actualizar cualquier asiento"
  ON journal_entries
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Política para journal_entry_items: Solo visible para creador del asiento padre
CREATE POLICY "Usuarios pueden ver líneas de sus propios asientos"
  ON journal_entry_items
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
        (created_by = auth.uid() OR 
        EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'))));

CREATE POLICY "Usuarios pueden insertar líneas para sus asientos"
  ON journal_entry_items
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
            created_by = auth.uid() AND is_approved = false));

CREATE POLICY "Usuarios pueden actualizar líneas de sus asientos no aprobados"
  ON journal_entry_items
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
        created_by = auth.uid() AND is_approved = false));

CREATE POLICY "Usuarios pueden eliminar líneas de sus asientos no aprobados"
  ON journal_entry_items
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM journal_entries WHERE id = journal_entry_id AND 
        created_by = auth.uid() AND is_approved = false));

-- Política para accounts: Todos pueden ver, pero solo admin puede modificar
CREATE POLICY "Todos los usuarios pueden ver todas las cuentas"
  ON accounts
  FOR SELECT
  USING (true);

CREATE POLICY "Solo administradores pueden crear cuentas"
  ON accounts
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Solo administradores pueden actualizar cuentas"
  ON accounts
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Política para accounting_periods: Todos pueden ver, solo admin puede modificar
CREATE POLICY "Todos los usuarios pueden ver los períodos contables"
  ON accounting_periods
  FOR SELECT
  USING (true);

CREATE POLICY "Solo administradores pueden crear períodos contables"
  ON accounting_periods
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Solo administradores pueden actualizar períodos contables"
  ON accounting_periods
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Política para user_profiles: Solo el propio usuario y admin pueden ver y editar
CREATE POLICY "Usuarios pueden ver su propio perfil"
  ON user_profiles
  FOR SELECT
  USING (auth.uid() = user_id OR
         EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id OR
         EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Política para activity_logs: Registros de auditoría visibles para admin
CREATE POLICY "Todos usuarios pueden ver sus propias actividades"
  ON activity_logs
  FOR SELECT
  USING (user_id = auth.uid() OR
         EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Función para registrar actividad automáticamente
CREATE OR REPLACE FUNCTION register_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_logs (
    user_id,
    activity_type,
    table_name,
    record_id,
    description,
    created_at
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    NEW.id,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Creación de registro'
      WHEN TG_OP = 'UPDATE' THEN 'Actualización de registro'
      WHEN TG_OP = 'DELETE' THEN 'Eliminación de registro'
    END,
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers para registrar actividad en tablas principales
CREATE TRIGGER on_journal_entry_change
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION register_activity();

CREATE TRIGGER on_account_change
AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION register_activity();

CREATE TRIGGER on_period_change
AFTER INSERT OR UPDATE OR DELETE ON accounting_periods
FOR EACH ROW EXECUTE FUNCTION register_activity(); 