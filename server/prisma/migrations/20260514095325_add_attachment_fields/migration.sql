-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentHeight" INTEGER,
ADD COLUMN     "attachmentKey" TEXT,
ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentThumbKey" TEXT,
ADD COLUMN     "attachmentWidth" INTEGER;
