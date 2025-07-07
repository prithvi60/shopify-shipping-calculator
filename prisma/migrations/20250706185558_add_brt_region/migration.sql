-- CreateTable
CREATE TABLE "Courier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "zones" JSONB NOT NULL,
    "weightBrackets" JSONB NOT NULL,
    "fuelSurcharge" REAL NOT NULL,
    "deliveryFees" JSONB NOT NULL,
    "volumetricDivisor" INTEGER NOT NULL,
    "vatPercent" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "volume" REAL NOT NULL,
    "weight" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "costVat" REAL NOT NULL,
    "dimensions" JSONB NOT NULL
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dryIceCost" REAL NOT NULL,
    "dryIceVolume" REAL NOT NULL,
    "freshPerDay" REAL NOT NULL,
    "frozenPerDay" REAL NOT NULL,
    "wineSurcharge" REAL NOT NULL,
    "vatRate" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "BRTRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "region" TEXT NOT NULL,
    "price" TEXT NOT NULL
);
