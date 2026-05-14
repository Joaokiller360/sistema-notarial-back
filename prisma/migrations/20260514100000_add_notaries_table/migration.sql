-- CreateTable
CREATE TABLE "notaries" (
    "id" SERIAL NOT NULL,
    "notary_name" VARCHAR(200) NOT NULL,
    "notary_number" INTEGER NOT NULL,
    "notary_officer_name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notaries_notary_number_key" ON "notaries"("notary_number");
