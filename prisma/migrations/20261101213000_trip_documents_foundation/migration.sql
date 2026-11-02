-- Metadados de documentos privados. O conteúdo permanece em armazenamento
-- privado externo ao repositório e nunca é exposto por /assets.
CREATE TABLE "TripDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING_SCAN',
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractionStartedAt" DATETIME,
    "extractedAt" DATETIME,
    "extractionError" TEXT,
    "retentionUntil" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripDocument_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TripDocument_storageKey_key" ON "TripDocument"("storageKey");
CREATE INDEX "TripDocument_tripId_idx" ON "TripDocument"("tripId");
CREATE INDEX "TripDocument_scanStatus_idx" ON "TripDocument"("scanStatus");
CREATE INDEX "TripDocument_retentionUntil_idx" ON "TripDocument"("retentionUntil");
