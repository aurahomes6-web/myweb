ALTER TABLE "Property"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Property"
ALTER COLUMN "bedrooms" DROP NOT NULL,
ALTER COLUMN "bathrooms" DROP NOT NULL,
ALTER COLUMN "sqft" DROP NOT NULL;

CREATE TABLE "BookingDateBlock" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BookingDateBlock_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BookingDateBlock_dates_check" CHECK ("startDate" <= "endDate")
);

CREATE INDEX "BookingDateBlock_propertyId_startDate_endDate_idx"
ON "BookingDateBlock"("propertyId", "startDate", "endDate");

ALTER TABLE "BookingDateBlock"
ADD CONSTRAINT "BookingDateBlock_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
