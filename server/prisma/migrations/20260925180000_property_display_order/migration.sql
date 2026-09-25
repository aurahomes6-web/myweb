ALTER TABLE "Property"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "Property"
SET "sortOrder" = CASE "slug"
    WHEN 'aura-cozy-penthouse-1' THEN 1
    WHEN 'aura-cozy-penthouse-2' THEN 2
    WHEN 'aura-cozy-penthouse-3' THEN 3
    ELSE "sortOrder"
END;

CREATE INDEX "Property_sortOrder_idx" ON "Property"("sortOrder");
