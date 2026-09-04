-- AlterTable
ALTER TABLE "uafe_forms" ADD COLUMN     "compareciente_id" VARCHAR(50),
ADD COLUMN     "compareciente_nombre" VARCHAR(250);

-- CreateIndex
CREATE INDEX "uafe_forms_compareciente_id_idx" ON "uafe_forms"("compareciente_id");
