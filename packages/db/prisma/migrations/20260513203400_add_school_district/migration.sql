-- CreateTable
CREATE TABLE "SchoolDistrict" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "boardDocsSlug" TEXT NOT NULL,
    "jurisdictionFips" TEXT,
    "lastScrapedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolDistrict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolDistrict_state_idx" ON "SchoolDistrict"("state");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolDistrict_state_boardDocsSlug_key" ON "SchoolDistrict"("state", "boardDocsSlug");
