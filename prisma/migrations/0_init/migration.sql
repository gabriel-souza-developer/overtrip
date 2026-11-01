-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "headlineDisplay" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "startDateISO" DATETIME NOT NULL,
    "endDateISO" DATETIME,
    "departureTime" TEXT,
    "departureTolerance" TEXT,
    "returnTime" TEXT,
    "scheduleInfo" TEXT,
    "scheduleTBD" BOOLEAN NOT NULL DEFAULT false,
    "priceValue" REAL,
    "priceDisplay" TEXT,
    "priceUnit" TEXT NOT NULL DEFAULT 'por pessoa',
    "free" BOOLEAN NOT NULL DEFAULT false,
    "intensityClass" TEXT NOT NULL,
    "spotsLeft" INTEGER,
    "trailDistance" TEXT,
    "supportPoint" TEXT,
    "supportPointInfo" TEXT,
    "meetingCity" TEXT,
    "meetingPoint" TEXT,
    "meetingDetails" TEXT,
    "meetingMapsQuery" TEXT,
    "includes" TEXT NOT NULL,
    "includesHighlight" TEXT,
    "includedServices" TEXT,
    "itinerary" TEXT,
    "routeNotes" TEXT,
    "importantInfo" TEXT,
    "media" TEXT NOT NULL,
    "buttonLabel" TEXT NOT NULL DEFAULT 'Quero viajar',
    "buttonClass" TEXT NOT NULL DEFAULT 'button-dark',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "availabilitySchema" TEXT NOT NULL DEFAULT 'https://schema.org/InStock',
    "storedIdentity" TEXT NOT NULL,
    "titleSearch" TEXT NOT NULL DEFAULT '',
    "citySearch" TEXT NOT NULL DEFAULT '',
    "categorySearch" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TripDeparture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "mapsUrl" TEXT,
    "mapsQuery" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripDeparture_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" DATETIME,
    "city" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "images" TEXT,
    "storedIdentity" TEXT NOT NULL,
    "source" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "titleSearch" TEXT NOT NULL DEFAULT '',
    "citySearch" TEXT NOT NULL DEFAULT '',
    "regionSearch" TEXT NOT NULL DEFAULT '',
    "sourceSearch" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Visit_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GalleryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "dateDisplay" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT NOT NULL,
    "tripId" TEXT,
    "visitId" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL,
    "storedIdentity" TEXT NOT NULL,
    "source" TEXT,
    "titleSearch" TEXT NOT NULL DEFAULT '',
    "descriptionSearch" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GalleryEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GalleryEntry_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ImportSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "tripsJson" TEXT NOT NULL,
    "visitedPlaces" TEXT NOT NULL,
    "gallery" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Trip_storedIdentity_key" ON "Trip"("storedIdentity");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE INDEX "Trip_startDateISO_idx" ON "Trip"("startDateISO");

-- CreateIndex
CREATE INDEX "Trip_storedIdentity_idx" ON "Trip"("storedIdentity");

-- CreateIndex
CREATE INDEX "Trip_titleSearch_idx" ON "Trip"("titleSearch");

-- CreateIndex
CREATE INDEX "Trip_citySearch_idx" ON "Trip"("citySearch");

-- CreateIndex
CREATE INDEX "Trip_categorySearch_idx" ON "Trip"("categorySearch");

-- CreateIndex
CREATE INDEX "TripDeparture_tripId_idx" ON "TripDeparture"("tripId");

-- CreateIndex
CREATE INDEX "TripDeparture_orderIndex_idx" ON "TripDeparture"("orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_storedIdentity_key" ON "Visit"("storedIdentity");

-- CreateIndex
CREATE INDEX "Visit_tripId_idx" ON "Visit"("tripId");

-- CreateIndex
CREATE INDEX "Visit_lat_lng_idx" ON "Visit"("lat", "lng");

-- CreateIndex
CREATE INDEX "Visit_date_idx" ON "Visit"("date");

-- CreateIndex
CREATE INDEX "Visit_needsReview_idx" ON "Visit"("needsReview");

-- CreateIndex
CREATE INDEX "Visit_storedIdentity_idx" ON "Visit"("storedIdentity");

-- CreateIndex
CREATE INDEX "Visit_titleSearch_idx" ON "Visit"("titleSearch");

-- CreateIndex
CREATE INDEX "Visit_citySearch_idx" ON "Visit"("citySearch");

-- CreateIndex
CREATE INDEX "Visit_regionSearch_idx" ON "Visit"("regionSearch");

-- CreateIndex
CREATE INDEX "Visit_sourceSearch_idx" ON "Visit"("sourceSearch");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryEntry_storedIdentity_key" ON "GalleryEntry"("storedIdentity");

-- CreateIndex
CREATE INDEX "GalleryEntry_date_idx" ON "GalleryEntry"("date");

-- CreateIndex
CREATE INDEX "GalleryEntry_isFeatured_idx" ON "GalleryEntry"("isFeatured");

-- CreateIndex
CREATE INDEX "GalleryEntry_tripId_idx" ON "GalleryEntry"("tripId");

-- CreateIndex
CREATE INDEX "GalleryEntry_visitId_idx" ON "GalleryEntry"("visitId");

-- CreateIndex
CREATE INDEX "GalleryEntry_storedIdentity_idx" ON "GalleryEntry"("storedIdentity");

-- CreateIndex
CREATE INDEX "GalleryEntry_titleSearch_idx" ON "GalleryEntry"("titleSearch");

-- CreateIndex
CREATE INDEX "GalleryEntry_descriptionSearch_idx" ON "GalleryEntry"("descriptionSearch");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE INDEX "ImportSnapshot_createdAt_idx" ON "ImportSnapshot"("createdAt");

┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.28                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
