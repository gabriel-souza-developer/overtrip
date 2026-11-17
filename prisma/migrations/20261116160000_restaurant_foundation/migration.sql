CREATE TABLE "RestaurantTable" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantTable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantTable_id_organizationId_key" ON "RestaurantTable"("id", "organizationId");
CREATE UNIQUE INDEX "RestaurantTable_organizationId_name_key" ON "RestaurantTable"("organizationId", "name");
CREATE TABLE "RestaurantReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "guestName" TEXT NOT NULL,
  "partySize" INTEGER NOT NULL,
  "date" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantReservation_tableId_organizationId_fkey" FOREIGN KEY ("tableId", "organizationId") REFERENCES "RestaurantTable"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantReservation_id_tableId_key" ON "RestaurantReservation"("id", "tableId");
CREATE INDEX "RestaurantReservation_organizationId_date_idx" ON "RestaurantReservation"("organizationId", "date");
-- A chave (mesa, data, turno) impede reservas simultâneas conflitantes.
-- O cancelamento apaga a linha e libera o turno; a reserva em si permanece
-- no histórico com status CANCELLED.
CREATE TABLE "RestaurantOccupancy" (
  "reservationId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  PRIMARY KEY ("tableId", "date", "shift"),
  CONSTRAINT "RestaurantOccupancy_reservationId_tableId_fkey" FOREIGN KEY ("reservationId", "tableId") REFERENCES "RestaurantReservation"("id", "tableId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RestaurantOccupancy_reservationId_idx" ON "RestaurantOccupancy"("reservationId");
