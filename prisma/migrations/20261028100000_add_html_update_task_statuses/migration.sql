-- Нові task-статуси та прапорець is_banner_update. Лише додає значення enum і
-- нову колонку з DEFAULT false (наявні рядки отримують false), нічого не видаляє.
-- Нові значення enum не можна використати в тій самій транзакції, тому CHECK
-- з ними окремо, у міграції 20261028100100_html_update_task_status_check.
ALTER TYPE "task_status" ADD VALUE IF NOT EXISTS 'welcome_email_html_update';
ALTER TYPE "task_status" ADD VALUE IF NOT EXISTS 'system_email_html_update';

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "is_banner_update" BOOLEAN NOT NULL DEFAULT false;
