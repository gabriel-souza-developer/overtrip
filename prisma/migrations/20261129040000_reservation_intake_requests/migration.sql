-- Migração aditiva: duas colunas com padrão em "Reservation" (registros
-- existentes ficam MANUAL e sem revisão pendente) e uma tabela nova.
-- Retorno (com o serviço de entrada parado e backup feito):
--   DROP TABLE "ReservationIntakeRequest";
--   reservas com source = 'WHATSAPP_N8N' continuam válidas para o painel antigo;
--   as colunas extras podem permanecer (o código anterior as ignora) ou ser
--   removidas com ALTER TABLE "Reservation" DROP COLUMN (SQLite >= 3.35).
--   Depois: prisma migrate resolve --rolled-back 20261129040000_reservation_intake_requests
ALTER TABLE "Reservation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Reservation" ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReservationIntakeRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "idempotencyKeyHash" TEXT NOT NULL,
    "payloadSalt" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "ReservationIntakeRequest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReservationIntakeRequest_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReservationIntakeRequest_idempotencyKeyHash_key" ON "ReservationIntakeRequest"("idempotencyKeyHash");
CREATE INDEX "ReservationIntakeRequest_reservationId_idx" ON "ReservationIntakeRequest"("reservationId");
CREATE INDEX "ReservationIntakeRequest_tripId_idx" ON "ReservationIntakeRequest"("tripId");
CREATE INDEX "ReservationIntakeRequest_expiresAt_idx" ON "ReservationIntakeRequest"("expiresAt");
CREATE INDEX "ReservationIntakeRequest_organizationId_idx" ON "ReservationIntakeRequest"("organizationId");
