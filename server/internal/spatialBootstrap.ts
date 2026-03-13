import { sql } from "drizzle-orm";
import { db } from "../db-postgres";

export class SpatialBootstrap {
  private ready = false;
  private initPromise: Promise<void> | null = null;

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      try {
        await db.execute(sql`SET search_path TO public`);
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS postgis`);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.aeon_branches (
            id text PRIMARY KEY,
            name text NOT NULL,
            branch_address text,
            phone_number text,
            fax_number text,
            business_hour text,
            day_open text,
            atm_cdm text,
            inquiry_availability text,
            application_availability text,
            aeon_lounge text,
            branch_lat double precision NOT NULL,
            branch_lng double precision NOT NULL
          )
        `);
        await db.execute(sql`
          CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
            postcode text PRIMARY KEY,
            lat double precision NOT NULL,
            lng double precision NOT NULL,
            source_branch text,
            state text
          )
        `);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text`);
        await db.execute(sql`ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng ON public.aeon_branches (branch_lat, branch_lng)`);
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique ON public.aeon_branches (lower(name))`);
        await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_aeon_postcodes ON public.aeon_branch_postcodes (postcode)`);

        this.ready = true;
      } catch (err: any) {
        console.warn("⚠️ Failed to ensure PostGIS tables:", err?.message || err);
      }
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }
}
