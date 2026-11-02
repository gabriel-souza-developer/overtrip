CREATE TABLE "AssistantConversationEvent" (
  "conversationId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "expectedRevision" INTEGER NOT NULL,
  "resultState" TEXT NOT NULL,
  "resultRevision" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("conversationId", "eventId"),
  CONSTRAINT "AssistantConversationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversationState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
