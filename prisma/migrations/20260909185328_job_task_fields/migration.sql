-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('new', 'update', 'localization');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('email', 'sms', 'web_push', 'notification_center', 'in_app');

-- CreateEnum
CREATE TYPE "board" AS ENUM ('ONBOARDING', 'Onboarding_2_not_ready', 'CHURN_15');

-- AlterTable: нові обов'язкові поля для jobs.
-- Без DEFAULT — якщо в jobs вже є рядки, ALTER впаде з помилкою (і нічого
-- не зламає, все в одній транзакції), а не мовчки проставить сміттєве значення.
ALTER TABLE "jobs"
  ADD COLUMN "task_status" "task_status" NOT NULL,
  ADD COLUMN "message_type" "message_type" NOT NULL,
  ADD COLUMN "board" "board" NOT NULL,
  ADD COLUMN "task_description" TEXT NOT NULL;
