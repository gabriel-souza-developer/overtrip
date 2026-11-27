CREATE TABLE "PassengerProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "nameCipher" TEXT NOT NULL,
  "nameLookup" TEXT NOT NULL,
  "phoneCipher" TEXT,
  "phoneNameLookup" TEXT,
  "documentCipher" TEXT,
  "documentLookup" TEXT,
  "importIdentityLookup" TEXT,
  "emergencyCipher" TEXT,
  "emailCipher" TEXT,
  "hasTravelHistory" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PassengerTrip" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL,
  "tripId" TEXT,
  "legacyTripTitle" TEXT,
  "paymentStatus" TEXT,
  "paymentLabel" TEXT,
  "amountCents" INTEGER,
  "attended" BOOLEAN,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "legacyImportKey" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PassengerTrip_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PassengerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PassengerTrip_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "PassengerAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "tripId" TEXT,
  "passengerTripId" TEXT,
  "rowCount" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "PassengerProfile_phoneNameLookup_key" ON "PassengerProfile"("phoneNameLookup");
CREATE UNIQUE INDEX "PassengerProfile_importIdentityLookup_key" ON "PassengerProfile"("importIdentityLookup");
CREATE UNIQUE INDEX "PassengerTrip_legacyImportKey_key" ON "PassengerTrip"("legacyImportKey");
CREATE INDEX "PassengerProfile_organizationId_idx" ON "PassengerProfile"("organizationId");
CREATE INDEX "PassengerProfile_nameLookup_idx" ON "PassengerProfile"("nameLookup");
CREATE INDEX "PassengerProfile_documentLookup_idx" ON "PassengerProfile"("documentLookup");
CREATE INDEX "PassengerTrip_tripId_createdAt_idx" ON "PassengerTrip"("tripId", "createdAt");
CREATE INDEX "PassengerTrip_profileId_idx" ON "PassengerTrip"("profileId");
CREATE UNIQUE INDEX "PassengerTrip_tripId_profileId_key" ON "PassengerTrip"("tripId", "profileId");
CREATE INDEX "PassengerAuditLog_tripId_createdAt_idx" ON "PassengerAuditLog"("tripId", "createdAt");
CREATE INDEX "PassengerAuditLog_passengerTripId_idx" ON "PassengerAuditLog"("passengerTripId");

