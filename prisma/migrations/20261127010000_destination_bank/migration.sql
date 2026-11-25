-- Banco privado de destinos (aditivo: só tabelas novas, nenhuma coluna existente muda).
-- Retorno: DROP TABLE "DestinationOuting"; DROP TABLE "Destination"; (nenhum outro dado depende delas.)
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "region" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "originCity" TEXT,
    "distanceKm" INTEGER,
    "trailLevel" TEXT,
    "bestSeason" TEXT,
    "notes" TEXT,
    "links" TEXT NOT NULL DEFAULT '[]',
    "importKey" TEXT,
    "nameSearch" TEXT NOT NULL DEFAULT '',
    "citySearch" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Destination_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DestinationOuting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "destinationId" TEXT NOT NULL,
    "date" DATETIME,
    "passengers" INTEGER,
    "pricePerPersonCents" INTEGER,
    "transportCostCents" INTEGER,
    "extraCostCents" INTEGER,
    "supplier" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DestinationOuting_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Destination_importKey_key" ON "Destination"("importKey");
CREATE INDEX "Destination_organizationId_idx" ON "Destination"("organizationId");
CREATE INDEX "Destination_status_idx" ON "Destination"("status");
CREATE INDEX "Destination_nameSearch_idx" ON "Destination"("nameSearch");
CREATE INDEX "Destination_citySearch_idx" ON "Destination"("citySearch");
CREATE INDEX "DestinationOuting_destinationId_date_idx" ON "DestinationOuting"("destinationId", "date");
