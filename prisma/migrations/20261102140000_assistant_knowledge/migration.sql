CREATE TABLE "AssistantKnowledgeVersion" (
    "version" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entries" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantKnowledgeVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
