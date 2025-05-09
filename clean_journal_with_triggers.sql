--Script para eliminar registros con desactivacion de triggers
--Desactivar temporalmente los triggers
ALTER TABLE journal_entry_items DISABLE TRIGGER ALL;
ALTER TABLE journal_entries DISABLE TRIGGER ALL;

--Eliminar los registros
DELETE FROM journal_entry_items;
DELETE FROM journal_entry_items;
DELETE FROM journal_entries;

--Reactivar los triggers
ALTER TABLE journal_entry_items ENABLE TRIGGER ALL;
ALTER TABLE journal_entries ENABLE TRIGGER ALL;
