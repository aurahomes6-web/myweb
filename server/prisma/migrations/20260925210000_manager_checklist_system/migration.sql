-- Manager checklist system: manager accounts, per-property checklist
-- definitions, and per-day completion records.
--
-- Additive only: no existing table is altered or dropped, so booking, Airbnb,
-- payment, coupon and block-date data is preserved untouched.

CREATE TABLE "ManagerUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagerUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerUser_username_key" ON "ManagerUser"("username");

CREATE INDEX "ManagerUser_isActive_idx" ON "ManagerUser"("isActive");

CREATE TABLE "ManagerChecklistItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagerChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManagerChecklistItem_propertyId_sortOrder_idx"
ON "ManagerChecklistItem"("propertyId", "sortOrder");

ALTER TABLE "ManagerChecklistItem"
ADD CONSTRAINT "ManagerChecklistItem_title_length_check"
CHECK (char_length(btrim("title")) BETWEEN 1 AND 120);

ALTER TABLE "ManagerChecklistItem"
ADD CONSTRAINT "ManagerChecklistItem_description_length_check"
CHECK ("description" IS NULL OR char_length("description") <= 300);

ALTER TABLE "ManagerChecklistItem"
ADD CONSTRAINT "ManagerChecklistItem_sortOrder_check"
CHECK ("sortOrder" >= 0);

ALTER TABLE "ManagerChecklistItem"
ADD CONSTRAINT "ManagerChecklistItem_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ManagerChecklistCompletion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ManagerChecklistCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagerChecklistCompletion_itemId_managerId_dateKey_key"
ON "ManagerChecklistCompletion"("itemId", "managerId", "dateKey");

CREATE INDEX "ManagerChecklistCompletion_propertyId_dateKey_idx"
ON "ManagerChecklistCompletion"("propertyId", "dateKey");

CREATE INDEX "ManagerChecklistCompletion_managerId_dateKey_idx"
ON "ManagerChecklistCompletion"("managerId", "dateKey");

ALTER TABLE "ManagerChecklistCompletion"
ADD CONSTRAINT "ManagerChecklistCompletion_dateKey_check"
CHECK ("dateKey" ~ '^\d{4}-\d{2}-\d{2}$');

-- Restrict (not Cascade) so a checklist item can never take historical daily
-- completion records with it. The service soft-deletes items instead.
ALTER TABLE "ManagerChecklistCompletion"
ADD CONSTRAINT "ManagerChecklistCompletion_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "ManagerChecklistItem"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ManagerChecklistCompletion"
ADD CONSTRAINT "ManagerChecklistCompletion_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "ManagerUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagerChecklistCompletion"
ADD CONSTRAINT "ManagerChecklistCompletion_propertyId_fkey"
FOREIGN KEY ("propertyId") REFERENCES "Property"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
