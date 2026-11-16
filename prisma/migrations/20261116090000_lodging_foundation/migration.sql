CREATE TABLE "LodgingUnit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LodgingUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LodgingUnit_id_organizationId_key" ON "LodgingUnit"("id", "organizationId");
CREATE UNIQUE INDEX "LodgingUnit_organizationId_name_key" ON "LodgingUnit"("organizationId", "name");
CREATE TABLE "LodgingReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "guestName" TEXT NOT NULL,
  "checkIn" TEXT NOT NULL,
  "checkOut" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LodgingReservation_unitId_organizationId_fkey" FOREIGN KEY ("unitId", "organizationId") REFERENCES "LodgingUnit"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LodgingReservation_id_unitId_key" ON "LodgingReservation"("id", "unitId");
CREATE INDEX "LodgingReservation_organizationId_checkIn_idx" ON "LodgingReservation"("organizationId", "checkIn");
CREATE TABLE "LodgingNight" (
  "reservationId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "night" TEXT NOT NULL,
  PRIMARY KEY ("unitId", "night"),
  CONSTRAINT "LodgingNight_reservationId_unitId_fkey" FOREIGN KEY ("reservationId", "unitId") REFERENCES "LodgingReservation"("id", "unitId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LodgingNight_reservationId_idx" ON "LodgingNight"("reservationId");
