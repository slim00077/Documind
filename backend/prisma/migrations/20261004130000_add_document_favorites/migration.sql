-- CreateTable
CREATE TABLE "DocumentFavorite" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFavorite_documentId_userId_key" ON "DocumentFavorite"("documentId", "userId");

-- CreateIndex
CREATE INDEX "DocumentFavorite_userId_idx" ON "DocumentFavorite"("userId");

-- AddForeignKey
ALTER TABLE "DocumentFavorite" ADD CONSTRAINT "DocumentFavorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFavorite" ADD CONSTRAINT "DocumentFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
