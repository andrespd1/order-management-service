import { PrismaClient } from "@prisma/client";

// Single shared client per process (Prisma owns its own connection pool).
export const prisma = new PrismaClient();
