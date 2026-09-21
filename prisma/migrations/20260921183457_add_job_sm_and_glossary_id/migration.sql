-- Додає два nullable UUID-стовпці в jobs, без FK/constraints, без зачіпання
-- будь-яких інших таблиць спільної бази.
ALTER TABLE "jobs" ADD COLUMN "sm" UUID;
ALTER TABLE "jobs" ADD COLUMN "glossary_id" UUID;
