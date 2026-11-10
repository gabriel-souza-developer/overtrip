-- Vínculo opcional entre interessado e reserva, sem alteração das reservas existentes.
ALTER TABLE "Reservation" ADD COLUMN "leadId" TEXT REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Reservation_leadId_idx" ON "Reservation"("leadId");
