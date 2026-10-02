-- Перейменування значення enum board: Onboarding_2_not_ready -> onboarding_comms.
-- RENAME VALUE лише перейменовує мітку в типі, існуючі рядки jobs.board
-- автоматично продовжують вказувати на те саме значення (без зміни даних).
ALTER TYPE "board" RENAME VALUE 'Onboarding_2_not_ready' TO 'onboarding_comms';
