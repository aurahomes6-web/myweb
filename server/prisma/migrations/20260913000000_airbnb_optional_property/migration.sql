-- Airbnb reservations may arrive from the public WhatsApp flow without a known
-- home yet. propertyId becomes optional (unassigned submission) and the
-- confirmation/reservation number is no longer enforced as unique because it
-- is optional and empty/duplicate values are legitimate.
--
-- Deleting a Property no longer cascades into reservations: it would be
-- rejected by deleteProperty while assigned reservations exist anyway.

-- DropForeignKey
ALTER TABLE "AirbnbReservation" DROP CONSTRAINT "AirbnbReservation_propertyId_fkey";

-- DropIndex
DROP INDEX "AirbnbReservation_reservationNumber_key";

-- AlterTable
ALTER TABLE "AirbnbReservation" ALTER COLUMN "propertyId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AirbnbReservation" ADD CONSTRAINT "AirbnbReservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;