import "dotenv/config";
import {
  disconnectSecondary,
  getSecondaryClient,
} from "../src/lib/backup/secondary";

/**
 * Locks the standby database down.
 *
 * Supabase grants `select`, `insert`, `update` and `delete` on every new
 * table in the `public` schema to the `anon` and `authenticated` roles, and
 * it does **not** turn on Row Level Security for tables that were not created
 * through the dashboard. The standby is created by `prisma migrate deploy`,
 * so it inherits exactly that behaviour.
 *
 * The `anon` role is what the publishable key maps to, and the publishable
 * key is designed to be public. Left alone, the diary, the customer names and
 * phone numbers, and the owner's Argon2id password hash would all be readable
 * over the REST API by anyone who has the key.
 *
 * This script closes that door:
 *
 *   1. Row Level Security on every table in the standby. The standby is
 *      written by the table owner, so RLS does not get in the way of the
 *      backup itself.
 *   2. The grants are taken back. Policies alone do not remove a grant.
 *   3. The default privileges are revoked too, so tables created later — the
 *      two bookkeeping tables the backup creates at runtime — are protected
 *      from the moment they exist.
 *
 * The `service_role` grants are deliberately left alone: that role needs the
 * secret key, which is server-side only, and keeping it lets the dashboard's
 * table editor keep working.
 *
 *   npm run db:harden:secondary
 */

async function main(): Promise<void> {
  const secondary = getSecondaryClient();

  console.log("Hardening the standby database...");

  // 1. Row Level Security on every table.
  await secondary.$executeRaw`
    DO $$
    DECLARE
      r record;
    BEGIN
      FOR r IN
        SELECT tablename
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename NOT LIKE 'pg_%'
      LOOP
        EXECUTE format(
          'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
          r.tablename
        );
      END LOOP;
    END $$;
  `;
  console.log("  Row Level Security enabled on every table.");

  // 2. Take the grants back from the two public roles.
  await secondary.$executeRaw`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
      END IF;
    END $$;
  `;
  console.log("  Grants to anon and authenticated revoked.");

  // 3. So that tables created from now on are protected as well.
  await secondary.$executeRaw`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                 REVOKE ALL ON TABLES FROM anon';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                 REVOKE ALL ON SEQUENCES FROM anon';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                 REVOKE ALL ON TABLES FROM authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
                 REVOKE ALL ON SEQUENCES FROM authenticated';
      END IF;
    END $$;
  `;
  console.log("  Default privileges revoked for future tables.");

  // 4. Report what the standby looks like now.
  const tables = await secondary.$queryRaw<
    Array<{ tableName: string; rlsEnabled: boolean }>
  >`
    SELECT c.relname AS "tableName", c.relrowsecurity AS "rlsEnabled"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY c.relname
  `;

  const exposed = await secondary.$queryRaw<
    Array<{ grantee: string; tableName: string }>
  >`
    SELECT DISTINCT grantee, table_name AS "tableName"
      FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND grantee IN ('anon', 'authenticated')
     ORDER BY grantee, table_name
  `;

  console.log("\nStandby tables:");
  if (tables.length === 0) {
    console.log("  (none yet — run npm run db:migrate:deploy:secondary)");
  } else {
    for (const table of tables) {
      console.log(`  ${table.tableName} : rls=${table.rlsEnabled}`);
    }
  }

  if (exposed.length === 0) {
    console.log(
      "\nThe Data API cannot read any table in the standby. Nothing is exposed.",
    );
  } else {
    console.log("\nWARNING — these tables are still reachable over the Data API:");
    for (const row of exposed) {
      console.log(`  ${row.grantee} -> ${row.tableName}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Could not harden the standby database:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSecondary();
  });
