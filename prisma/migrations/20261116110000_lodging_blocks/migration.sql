-- Bloqueios e reservas compartilham a chave (unidade, noite), inclusive sob
-- concorrência. As noites de reservas existentes são copiadas integralmente.
CREATE TABLE "LodgingBlock" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "start" TEXT NOT NULL,
  "end" TEXT NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LodgingBlock_unitId_organizationId_fkey" FOREIGN KEY ("unitId", "organizationId") REFERENCES "LodgingUnit"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LodgingBlock_id_unitId_key" ON "LodgingBlock"("id", "unitId");
CREATE INDEX "LodgingBlock_organizationId_start_idx" ON "LodgingBlock"("organizationId", "start");

CREATE TABLE "LodgingNight_new" (
  "reservationId" TEXT,
  "blockId" TEXT,
  "unitId" TEXT NOT NULL,
  "night" TEXT NOT NULL,
  PRIMARY KEY ("unitId", "night"),
  CONSTRAINT "LodgingNight_owner_check" CHECK (("reservationId" IS NOT NULL AND "blockId" IS NULL) OR ("reservationId" IS NULL AND "blockId" IS NOT NULL)),
  CONSTRAINT "LodgingNight_reservationId_unitId_fkey" FOREIGN KEY ("reservationId", "unitId") REFERENCES "LodgingReservation"("id", "unitId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LodgingNight_blockId_unitId_fkey" FOREIGN KEY ("blockId", "unitId") REFERENCES "LodgingBlock"("id", "unitId") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "LodgingNight_new" ("reservationId", "unitId", "night") SELECT "reservationId", "unitId", "night" FROM "LodgingNight";
DROP TABLE "LodgingNight";
ALTER TABLE "LodgingNight_new" RENAME TO "LodgingNight";
CREATE INDEX "LodgingNight_reservationId_idx" ON "LodgingNight"("reservationId");
CREATE INDEX "LodgingNight_blockId_idx" ON "LodgingNight"("blockId");
