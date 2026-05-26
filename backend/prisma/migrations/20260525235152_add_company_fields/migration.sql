-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "companyDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "companyName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "salaryRange" TEXT NOT NULL DEFAULT '';
