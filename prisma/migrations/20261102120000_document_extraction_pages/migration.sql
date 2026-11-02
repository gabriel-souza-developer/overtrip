CREATE TABLE "TripDocumentPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "TripDocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TripDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TripDocumentPage_documentId_pageNumber_key" ON "TripDocumentPage"("documentId", "pageNumber");
CREATE INDEX "TripDocument_extractionStatus_scanStatus_idx" ON "TripDocument"("extractionStatus", "scanStatus");
