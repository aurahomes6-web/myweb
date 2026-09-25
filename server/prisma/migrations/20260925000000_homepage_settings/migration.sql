CREATE TABLE "HomepageSettings" (
    "id" TEXT NOT NULL DEFAULT 'single',
    "visualImageUrl" TEXT NOT NULL DEFAULT '',
    "visualImageAlt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomepageSettings_pkey" PRIMARY KEY ("id")
);
