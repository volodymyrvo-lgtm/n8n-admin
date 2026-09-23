-- Додає два стовпці в jobs, без FK/зачіпання інших таблиць спільної бази.
-- llm — nullable text (старі джоби значення не мають).
-- spend — NOT NULL jsonb з дефолтом '{}', тож існуючі рядки одразу
-- отримають порожній об'єкт замість NULL (ADD COLUMN ... DEFAULT для
-- сталого значення — швидка metadata-only операція в Postgres 11+).
ALTER TABLE "jobs" ADD COLUMN "llm" TEXT;
ALTER TABLE "jobs" ADD COLUMN "spend" JSONB NOT NULL DEFAULT '{}'::jsonb;
