-- Create public.super_admins if missing (used by SystemUser model).
-- Run with: npx prisma db execute --file prisma/create-super-admins.sql

CREATE TABLE IF NOT EXISTS "public"."super_admins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" VARCHAR(255) NOT NULL,
  "password" TEXT NOT NULL,
  "name" VARCHAR(200),
  "role" VARCHAR(50) NOT NULL DEFAULT 'super_admin',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "super_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "super_admins_email_key" ON "public"."super_admins"("email");
