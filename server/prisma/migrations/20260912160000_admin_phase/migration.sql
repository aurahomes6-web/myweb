-- Admin phase: Airbnb reservation management + editable property details.
--
-- New models:
--   AirbnbReservation — admin-registered Airbnb stays that occupy nights.
--   AirbnbGuest       — per-stay guest records (stored like Booking guests).
-- BlockedDate gains an optional airbnbReservationId so active Airbnb stays
-- show up through the existing availability/blocked-date checks, while
-- cancelling or deleting a reservation releases those nights automatically.

-- CreateEnum
CREATE TYPE "AirbnbStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Property"
    ADD COLUMN "beds" INTEGER;

-- CreateTable
CREATE TABLE "AirbnbReservation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "primaryPhone" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guestCount" INTEGER NOT NULL,
    "status" "AirbnbStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirbnbReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirbnbGuest" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "aadhaarNumber" TEXT NOT NULL,
    "gender" "GuestGender" NOT NULL,
    "age" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AirbnbGuest_pkey" PRIMARY KEY ("id")
);

-- AlterBlockedDate
ALTER TABLE "BlockedDate"
    ADD COLUMN "airbnbReservationId" TEXT;

-- CreateIndex (AirbnbReservation)
CREATE UNIQUE INDEX "AirbnbReservation_reservationNumber_key" ON "AirbnbReservation"("reservationNumber");
CREATE INDEX "AirbnbReservation_propertyId_checkIn_checkOut_idx" ON "AirbnbReservation"("propertyId", "checkIn", "checkOut");
CREATE INDEX "AirbnbReservation_status_idx" ON "AirbnbReservation"("status");

-- CreateIndex (AirbnbGuest)
CREATE INDEX "AirbnbGuest_reservationId_idx" ON "AirbnbGuest"("reservationId");

-- CreateIndex (BlockedDate)
CREATE INDEX "BlockedDate_airbnbReservationId_idx" ON "BlockedDate"("airbnbReservationId");

-- AddForeignKey
ALTER TABLE "AirbnbReservation" ADD CONSTRAINT "AirbnbReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AirbnbGuest" ADD CONSTRAINT "AirbnbGuest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "AirbnbReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockedDate" ADD CONSTRAINT "BlockedDate_airbnbReservationId_fkey" FOREIGN KEY ("airbnbReservationId") REFERENCES "AirbnbReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;