-- Marca de última actividad autenticada. Se usa para rechazar un segundo login
-- mientras haya una sesión activa dentro de la ventana de inactividad
-- (SESSION_IDLE_MINUTES). Solo agrega una columna nullable — no borra ni
-- modifica datos existentes.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);
