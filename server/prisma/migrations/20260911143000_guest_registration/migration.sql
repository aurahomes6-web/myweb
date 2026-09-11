-- Guest registration for Phase 5.
-- Booking drops the legacy single-guest columns in favour of a 1:many
-- relationship to Guest, plus guestCount / primaryPhone on the Booking.

-- AlterTable
ALTER TABLE "Booking"
    DROP COLUMN "guests",
    DROP COLUMN "guestName",
    DROP COLUMN "guestEmail",
    DROP COLUMN "guestPhone",
    ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "primaryPhone" TEXT NOT NULL DEFAULT '';

-- The temporary defaults above keep any existing rows valid; remove them so
-- the live schema matches schema.prisma exactly.
ALTER TABLE "Booking" ALTER COLUMN "guestCount" DROP DEFAULT;
ALTER TABLE "Booking" ALTER COLUMN "primaryPhone" DROP DEFAULT;

-- CreateEnum
CREATE TYPE "GuestGender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "gender" "GuestGender" NOT NULL,
    "age" INTEGER NOT NULL,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Guest_bookingId_idx" ON "Guest"("bookingId");

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;