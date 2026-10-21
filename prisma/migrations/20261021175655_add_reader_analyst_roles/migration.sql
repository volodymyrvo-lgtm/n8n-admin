-- Нові ролі користувачів. ADD VALUE лише дописує значення в кінець enum
-- (існуючі рядки users не змінюються). IF NOT EXISTS робить повторний запуск
-- безпечним.
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'reader';
ALTER TYPE "role" ADD VALUE IF NOT EXISTS 'analyst';
