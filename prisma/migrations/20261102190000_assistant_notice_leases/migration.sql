ALTER TABLE "AssistantHandoffNotice" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "AssistantHandoffNotice" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "AssistantHandoffNotice" ADD COLUMN "nextAttemptAt" DATETIME;
