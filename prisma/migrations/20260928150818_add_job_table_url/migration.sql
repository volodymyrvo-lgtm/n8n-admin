-- Додає nullable стовпець table_url у jobs. Без FK, без зачіпання інших
-- таблиць спільної бази.
ALTER TABLE "jobs" ADD COLUMN "table_url" TEXT;
