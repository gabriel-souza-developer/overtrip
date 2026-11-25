CREATE TABLE "SocialMedia" (
 "id" TEXT NOT NULL PRIMARY KEY, "storageKey" TEXT NOT NULL, "sha256" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "width" INTEGER NOT NULL, "height" INTEGER NOT NULL,
 "sizeBytes" INTEGER NOT NULL, "createdById" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SocialMedia_storageKey_key" ON "SocialMedia"("storageKey");
ALTER TABLE "SocialPostVariant" ADD COLUMN "socialMediaId" TEXT REFERENCES "SocialMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
