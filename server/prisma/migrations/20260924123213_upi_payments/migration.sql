-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "paymentRejectedAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus",
ADD COLUMN     "paymentSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionMessage" TEXT,
ADD COLUMN     "utr" TEXT;

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");
