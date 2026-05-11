-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "nombres_completos" TEXT NOT NULL,
    "cedula_o_ruc" TEXT,
    "nacionalidad" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_cedula_o_ruc_idx" ON "clients"("cedula_o_ruc");
