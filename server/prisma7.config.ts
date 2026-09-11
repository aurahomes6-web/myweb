// Prisma 7 configuration for the AURA HOMES server.
//
// DATABASE_URL (transaction pooler) powers the Prisma Client at runtime.
// DIRECT_URL   (session pooler) is used by Prisma Migrate (see schema.prisma).
// Both are read from server/.env via dotenv; credentials are never committed.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env["DIRECT_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma CLI (migrations / introspection) connects through the Supabase
    // session-mode pooler. The Prisma Client at runtime uses the transaction
    // pooler (DATABASE_URL) via the PrismaPg driver adapter instead — see
    // src/lib/db.ts.
    url: directUrl ?? "postgresql://invalid:invalid@localhost:5432/invalid",
  },
});