-- AlterTable
ALTER TABLE "archives" ALTER COLUMN "type" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "pdf_download_disabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "uafe_forms" (
    "id" TEXT NOT NULL,
    "filled_by_id" TEXT,
    "filled_by_name" VARCHAR(200) NOT NULL,
    "filled_by_email" VARCHAR(200) NOT NULL,
    "filled_by_role" VARCHAR(50) NOT NULL,
    "template_id" VARCHAR(100) NOT NULL,
    "template_name" VARCHAR(200) NOT NULL,
    "data" JSONB NOT NULL,
    "nacionalidad" VARCHAR(120),
    "nivel_riesgo" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uafe_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uafe_comprobantes" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uafe_comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uafe_forms_filled_by_id_idx" ON "uafe_forms"("filled_by_id");

-- CreateIndex
CREATE INDEX "uafe_forms_created_at_idx" ON "uafe_forms"("created_at");

-- CreateIndex
CREATE INDEX "uafe_forms_nacionalidad_idx" ON "uafe_forms"("nacionalidad");

-- CreateIndex
CREATE INDEX "uafe_forms_nivel_riesgo_idx" ON "uafe_forms"("nivel_riesgo");

-- CreateIndex
CREATE INDEX "uafe_comprobantes_form_id_idx" ON "uafe_comprobantes"("form_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_is_revoked_expires_at_idx" ON "refresh_tokens"("user_id", "is_revoked", "expires_at");

-- AddForeignKey
ALTER TABLE "uafe_forms" ADD CONSTRAINT "uafe_forms_filled_by_id_fkey" FOREIGN KEY ("filled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uafe_comprobantes" ADD CONSTRAINT "uafe_comprobantes_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "uafe_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
