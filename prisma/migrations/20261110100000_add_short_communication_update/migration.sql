-- Новий task-статус short_communication_update та нові типи повідомлень
-- mobile_push і whatsapp. Лише додає значення enum, нічого не видаляє.
-- Нові значення enum не можна використати в тій самій транзакції, тому CHECK
-- з ними окремо, у міграції 20261110100100_short_communication_update_check.
ALTER TYPE "task_status" ADD VALUE IF NOT EXISTS 'short_communication_update';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'mobile_push';
ALTER TYPE "message_type" ADD VALUE IF NOT EXISTS 'whatsapp';
