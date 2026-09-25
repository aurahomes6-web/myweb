ALTER TABLE "Property"
ADD COLUMN "discountedPricePerNightPaise" INTEGER;

ALTER TABLE "Property"
ADD CONSTRAINT "Property_discountedPricePerNightPaise_check"
CHECK (
  "discountedPricePerNightPaise" IS NULL
  OR (
    "discountedPricePerNightPaise" > 0
    AND "discountedPricePerNightPaise" < "pricePerNightPaise"
  )
);
