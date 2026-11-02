CREATE TABLE "AssistantHandoffNotice" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "requestEventId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AssistantHandoffNotice_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversationState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AssistantHandoffNotice_conversationId_requestEventId_key" ON "AssistantHandoffNotice"("conversationId", "requestEventId");
CREATE INDEX "AssistantHandoffNotice_status_createdAt_idx" ON "AssistantHandoffNotice"("status", "createdAt");
