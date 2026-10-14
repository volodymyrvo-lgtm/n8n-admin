-- Розділення промптів за видом джоб (enum job_kind створено міграцією
-- add_job_kind_and_seo_fields, яка має бути застосована раніше).
-- DEFAULT 'communication' одразу проставляє значення всім наявним промптам.
ALTER TABLE "prompts" ADD COLUMN "kind" "job_kind" NOT NULL DEFAULT 'communication';
