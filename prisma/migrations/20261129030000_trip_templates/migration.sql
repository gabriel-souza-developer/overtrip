CREATE TABLE "TripTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceTripId" TEXT NOT NULL,
    "sourceTripTitle" TEXT NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "TripTemplate_sourceTripId_key" ON "TripTemplate"("sourceTripId");
CREATE INDEX "TripTemplate_name_idx" ON "TripTemplate"("name");
