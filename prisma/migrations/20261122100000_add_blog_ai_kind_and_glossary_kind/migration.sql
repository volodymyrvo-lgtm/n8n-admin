-- Новий вид blog_ai (джоби/правила/промпти/глосарії блог-асистента) і поле kind у
-- глосаріях. Наявні глосарії отримують communication. Нічого не видаляє.
-- Значення blog_ai тут ніде не використовується (ні в CHECK, ні в DEFAULT), тож
-- ADD VALUE і ADD COLUMN можуть бути в одній міграції.
ALTER TYPE "job_kind" ADD VALUE IF NOT EXISTS 'blog_ai';

ALTER TABLE "glossaries" ADD COLUMN IF NOT EXISTS "kind" "job_kind" NOT NULL DEFAULT 'communication';
