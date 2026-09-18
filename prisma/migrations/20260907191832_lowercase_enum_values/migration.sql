-- RenameEnumValues: значення enum'ів Role і JobStatus переводяться на нижній регістр.
-- ALTER TYPE ... RENAME VALUE перейменовує мітку "на місці" — існуючі рядки,
-- що вже мають старе значення, автоматично побачать нове, без UPDATE.
ALTER TYPE "role" RENAME VALUE 'ADMIN' TO 'admin';
ALTER TYPE "role" RENAME VALUE 'USER' TO 'user';
ALTER TYPE "job_status" RENAME VALUE 'PENDING' TO 'pending';
ALTER TYPE "job_status" RENAME VALUE 'SUCCESS' TO 'success';
ALTER TYPE "job_status" RENAME VALUE 'FAILED' TO 'failed';
