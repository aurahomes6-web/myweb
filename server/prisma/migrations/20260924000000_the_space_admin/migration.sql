-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "minGuests" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PropertySpaceAttribute" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "icon" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertySpaceAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertySpaceAttribute_propertyId_sort_idx" ON "PropertySpaceAttribute"("propertyId", "sort");

-- AddForeignKey
ALTER TABLE "PropertySpaceAttribute" ADD CONSTRAINT "PropertySpaceAttribute_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;