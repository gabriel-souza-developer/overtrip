CREATE TABLE "AssistantResponseAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgeVersion" INTEGER,
    "outcome" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantResponseAudit_knowledgeVersion_fkey" FOREIGN KEY ("knowledgeVersion") REFERENCES "AssistantKnowledgeVersion" ("version") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AssistantResponseAudit_createdAt_idx" ON "AssistantResponseAudit"("createdAt");
CREATE INDEX "AssistantResponseAudit_knowledgeVersion_idx" ON "AssistantResponseAudit"("knowledgeVersion");
