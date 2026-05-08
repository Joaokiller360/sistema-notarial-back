-- CreateEnum
CREATE TYPE "ArchiveType" AS ENUM ('P', 'D', 'A', 'C', 'O');

-- AlterTable
ALTER TABLE "archives" ADD COLUMN "type" "ArchiveType" NOT NULL DEFAULT 'O';

-- CreateIndex
CREATE INDEX "archives_type_idx" ON "archives"("type");
