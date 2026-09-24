-- CreateTable
CREATE TABLE "ContactSettings" (
    "id" TEXT NOT NULL DEFAULT 'single',
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the current footer values as the initial global contact configuration.
-- Additive only: no existing table or row is modified or removed.
INSERT INTO "ContactSettings" ("id", "email", "phone", "description", "createdAt", "updatedAt")
VALUES ('single', 'stay@aurahomes.com', '+91 00000 00000', 'Premium penthouse locations', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);