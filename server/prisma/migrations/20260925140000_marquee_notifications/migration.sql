CREATE TABLE "MarqueeNotification" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarqueeNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarqueeNotification_isActive_sort_idx"
ON "MarqueeNotification"("isActive", "sort");

ALTER TABLE "MarqueeNotification"
ADD CONSTRAINT "MarqueeNotification_message_length_check"
CHECK (char_length(btrim("message")) BETWEEN 1 AND 240);

ALTER TABLE "MarqueeNotification"
ADD CONSTRAINT "MarqueeNotification_sort_check"
CHECK ("sort" >= 0);
