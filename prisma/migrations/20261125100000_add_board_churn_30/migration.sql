-- Нове значення enum board: CHURN_30.
-- Нове значення ніде не використовується в CHECK-обмеженнях цієї ж міграції, тому окрема друга міграція не потрібна.
ALTER TYPE "board" ADD VALUE IF NOT EXISTS 'CHURN_30';
