import "dotenv/config";
import { getSecondaryClient } from "../src/lib/backup/secondary";

/**
 * Installs the fifteen-minute backup schedule on the standby database.
 *
 * The schedule is a Supabase cron job that posts to the app's backup
 * endpoint. The job lives in the standby database because that is the one
 * thing that is always on: if the primary database is unreachable the job
 * keeps firing and starts working again as soon as it recovers.
 *
 * The bearer token is stored in Supabase Vault rather than in the job
 * command, so it does not sit in plain text in `cron.job.command`.
 *
 *   npm run db:cron:setup -- --url https://your-app.vercel.app
 *
 * Re-running it replaces the job, so it is safe to run again after a deploy.
 */

const VAULT_SECRET_NAME = "diary_backup_secret";
const JOB_NAME = "diary-backup-sync";
const SCHEDULE = "*/15 * * * *";

function parseArgs(argv: string[]): { url?: string } {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--url" || argv[index] === "-u") {
      return { url: argv[index + 1] };
    }
  }
  return {};
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url =
    args.url?.trim() ||
    process.env.BACKUP_APP_URL?.trim() ||
    "";

  if (!url) {
    console.error(
      "The app URL is missing. Pass it like this:\n  npm run db:cron:setup -- --url https://your-app.vercel.app",
    );
    process.exit(1);
  }

  const secret = process.env.BACKUP_SECRET?.trim();
  if (!secret) {
    console.error("BACKUP_SECRET is not set in .env.");
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/+$/, "")}/api/cron/backup`;
  const secondary = getSecondaryClient();

  console.log("Installing the backup schedule...");

  // 1. The extensions the schedule needs.
  await secondary.$executeRawUnsafe(
    "CREATE SCHEMA IF NOT EXISTS extensions",
  );
  await secondary.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_cron");
  await secondary.$executeRawUnsafe(
    "CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions",
  );
  console.log("  pg_cron and pg_net are ready.");

  // 2. The bearer token, in Vault rather than in the job command.
  //
  //    The secret is written through the Vault functions rather than by
  //    inserting into `vault.secrets` directly: the encryption inside Vault
  //    needs privileges the pooled role does not have on its own.
  const existing = await secondary.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM vault.secrets WHERE name = '${VAULT_SECRET_NAME}'`,
  );
  if (existing.length > 0) {
    await secondary.$queryRawUnsafe(
      `SELECT vault.update_secret($1::uuid, $2, $3)`,
      existing[0].id,
      secret,
      VAULT_SECRET_NAME,
    );
  } else {
    await secondary.$queryRawUnsafe(
      `SELECT vault.create_secret($1, $2)`,
      secret,
      VAULT_SECRET_NAME,
    );
  }
  console.log("  The backup token is stored in Vault.");

  // 3. Replace the job. The token is read from Vault at run time.
  await secondary.$executeRawUnsafe(
    `SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = '${JOB_NAME}'`,
  );

  const command = `
    select net.http_post(
      url := '${endpoint}',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets
           where name = '${VAULT_SECRET_NAME}'
        )
      ),
      body := '{}'::jsonb
    ) as request_id;
  `;

  await secondary.$executeRawUnsafe(
    `SELECT cron.schedule('${JOB_NAME}', '${SCHEDULE}', $1)`,
    command,
  );
  console.log(`  The job "${JOB_NAME}" now runs every 15 minutes.`);

  // 4. Report what was installed.
  const jobs = await secondary.$queryRawUnsafe<
    Array<{ jobname: string; schedule: string; active: boolean }>
  >(
    `SELECT jobname, schedule, active FROM cron.job WHERE jobname = '${JOB_NAME}'`,
  );

  console.log("\nScheduled jobs:");
  for (const job of jobs) {
    console.log(
      `  ${job.jobname}  schedule="${job.schedule}"  active=${job.active}`,
    );
  }
  console.log(`\nIt will call:\n  ${endpoint}`);
  console.log(
    "\nThe job only starts working once the app is deployed with the backup",
  );
  console.log("endpoint and BACKUP_SECRET set in Vercel.");
}

main()
  .catch((error) => {
    console.error("Could not install the schedule:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { disconnectSecondary } = await import("../src/lib/backup/secondary");
    await disconnectSecondary();
  });
