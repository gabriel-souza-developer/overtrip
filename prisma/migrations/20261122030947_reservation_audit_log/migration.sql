-- CreateTable
CREATE TABLE "ReservationAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ReservationAuditLog_organizationId_reservationId_createdAt_idx" ON "ReservationAuditLog"("organizationId", "reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "ReservationAuditLog_organizationId_createdAt_idx" ON "ReservationAuditLog"("organizationId", "createdAt");
