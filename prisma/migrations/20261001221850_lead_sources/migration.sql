-- CreateTable
CREATE TABLE "LeadSource" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" DATETIME,
    "lastFound" INTEGER,
    "lastCreated" INTEGER,
    "lastError" TEXT
);
