-- Bloqueo de cuenta por intentos de login fallidos + sesión única por dispositivo.
-- Solo agrega columnas con DEFAULT — no borra ni modifica datos existentes.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "session_epoch" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN "session_epoch" INTEGER NOT NULL DEFAULT 0;
