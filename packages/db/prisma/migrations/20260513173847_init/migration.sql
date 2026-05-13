-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('bill', 'resolution', 'motion', 'ordinance', 'minutes', 'agenda', 'amendment');

-- CreateEnum
CREATE TYPE "JurisdictionLevel" AS ENUM ('federal', 'state', 'county', 'city', 'school_board', 'special_district');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('introduced', 'in_committee', 'passed', 'failed', 'signed', 'vetoed');

-- CreateEnum
CREATE TYPE "PoliticianRole" AS ENUM ('sponsor', 'cosponsor', 'voted_yes', 'voted_no', 'voted_abstain', 'author');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('new_document', 'status_change', 'upcoming_meeting');

-- CreateTable
CREATE TABLE "CivicDocument" (
    "id" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "level" "JurisdictionLevel" NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "jurisdictionFips" TEXT,
    "title" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "summary" TEXT,
    "status" "DocumentStatus" NOT NULL,
    "topics" TEXT[],
    "sourceUrl" TEXT NOT NULL,
    "introducedDate" TIMESTAMP(3) NOT NULL,
    "lastActionDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CivicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Politician" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "level" "JurisdictionLevel" NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "photoUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactFormUrl" TEXT,
    "bioguideId" TEXT,
    "sourceIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Politician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPolitician" (
    "documentId" TEXT NOT NULL,
    "politicianId" TEXT NOT NULL,
    "role" "PoliticianRole" NOT NULL,

    CONSTRAINT "DocumentPolitician_pkey" PRIMARY KEY ("documentId","politicianId","role")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "trialStartedAt" TIMESTAMP(3),
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "revenueCatUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserJurisdiction" (
    "userId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,

    CONSTRAINT "UserJurisdiction_pkey" PRIMARY KEY ("userId","jurisdiction")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" "NotificationType" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CivicDocument_jurisdiction_idx" ON "CivicDocument"("jurisdiction");

-- CreateIndex
CREATE INDEX "CivicDocument_level_idx" ON "CivicDocument"("level");

-- CreateIndex
CREATE INDEX "CivicDocument_status_idx" ON "CivicDocument"("status");

-- CreateIndex
CREATE INDEX "CivicDocument_type_idx" ON "CivicDocument"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Politician_bioguideId_key" ON "Politician"("bioguideId");

-- CreateIndex
CREATE INDEX "Politician_jurisdiction_idx" ON "Politician"("jurisdiction");

-- CreateIndex
CREATE INDEX "Politician_level_idx" ON "Politician"("level");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserJurisdiction_jurisdiction_idx" ON "UserJurisdiction"("jurisdiction");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_documentId_idx" ON "Notification"("documentId");

-- AddForeignKey
ALTER TABLE "DocumentPolitician" ADD CONSTRAINT "DocumentPolitician_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CivicDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPolitician" ADD CONSTRAINT "DocumentPolitician_politicianId_fkey" FOREIGN KEY ("politicianId") REFERENCES "Politician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserJurisdiction" ADD CONSTRAINT "UserJurisdiction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CivicDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
