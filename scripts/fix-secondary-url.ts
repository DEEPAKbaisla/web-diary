import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Repairs `SECONDARY_DATABASE_URL` in `.env`.
 *
 * Two things are wrong with a connection string copied straight out of the
 * Supabase dashboard.
 *
 * 1. **The password is not URL-encoded.** A Supabase password may contain
 *    `@`, `#`, `:`, `/`, `?`, `&` or `%`. Copied in raw they break the URL:
 *    `@` ends the userinfo early and `#` starts a fragment, so the
 *    connection silently points at the wrong host.
 *
 * 2. **The SSL mode is missing or wrong.** `sslmode=require` resolves to
 *    `verify-full`, which checks the server certificate against the public
 *    trust store. Supabase's pooler presents a certificate signed by
 *    Supabase's own CA, so verification fails with "self-signed certificate
 *    in certificate chain". `sslmode=no-verify` keeps the connection
 *    encrypted but skips that check.
 *
 * This script reads the broken value from `.env`, works out where the raw
 * password starts and ends, percent-encodes it, sets the SSL mode, and writes
 * the corrected value back.
 *
 * The password is never printed and never leaves the machine.
 *
 *   npm run db:url:fix
 */

const ENV_FILE = path.join(process.cwd(), ".env");
const KEY = "SECONDARY_DATABASE_URL";

/**
 * Supabase's pooler certificate is signed by Supabase's internal CA, which
 * is not in the public trust store, so the chain cannot be verified. The
 * connection is still encrypted; only the server identity check is skipped.
 *
 * For full verification, download the root certificate from
 * Project Settings -> Database -> SSL, and use
 * `sslmode=verify-full&sslrootcert=<path>` instead.
 */
const SSL_MODE = "no-verify";

/** Mask a connection string so it can safely be printed. */
function mask(url: string): string {
  return url.replace(/^(postgresql:\/\/[^:]*:)[^@]*(@)/, "$1***$2");
}

/** Does this URL already parse into a usable host, port and database? */
function isWellFormed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.length > 0 &&
      parsed.port.length > 0 &&
      parsed.pathname.length > 0
    );
  } catch {
    return false;
  }
}

type Split = {
  scheme: string;
  user: string;
  password: string;
  hostPortPath: string;
};

/**
 * Split a (possibly broken) connection string into its parts.
 *
 * The host is located by name rather than by counting separators, so a
 * password containing `@`, `#` or `/` still comes out in one piece.
 */
function split(raw: string): Split {
  const schemeEnd = raw.indexOf("://");
  if (schemeEnd === -1) {
    throw new Error("The value does not look like a connection string.");
  }
  const scheme = raw.slice(0, schemeEnd + 3);
  const rest = raw.slice(schemeEnd + 3);

  const hostMatch = /([a-z0-9][a-z0-9.-]*\.supabase\.com)/i.exec(rest);
  if (!hostMatch || hostMatch.index === undefined) {
    throw new Error(
      "Could not find the database host in the connection string. Copy it again from the Supabase dashboard.",
    );
  }

  const hostStart = hostMatch.index;
  const userinfo = rest.slice(0, hostStart);
  const hostPortPath = rest.slice(hostStart);

  // Everything up to the host is `user:password@`. The password may itself
  // contain `@`, so the separator is the final character, not the first one.
  if (!userinfo.endsWith("@")) {
    throw new Error(
      "The connection string does not separate the credentials from the host. Copy it again from the Supabase dashboard.",
    );
  }
  const credential = userinfo.slice(0, -1);

  const colon = credential.indexOf(":");
  if (colon === -1) {
    throw new Error("The connection string has no password.");
  }

  return {
    scheme,
    user: credential.slice(0, colon),
    password: credential.slice(colon + 1),
    hostPortPath,
  };
}

/** Replace the sslmode parameter, leaving the rest of the query alone. */
function withSslMode(hostPortPath: string, mode: string): string {
  const queryStart = hostPortPath.indexOf("?");
  const base =
    queryStart === -1
      ? hostPortPath
      : hostPortPath.slice(0, queryStart);
  const query =
    queryStart === -1
      ? ""
      : hostPortPath.slice(queryStart + 1).split("#")[0];

  const params = new URLSearchParams(query);
  params.set("sslmode", mode);

  return `${base}?${params.toString()}`;
}

async function main(): Promise<void> {
  const contents = await readFile(ENV_FILE, "utf8");
  const linePattern = new RegExp(`^${KEY}\\s*=.*$`, "m");
  const match = contents.match(linePattern);

  if (!match) {
    console.error(`${KEY} is not present in .env.`);
    process.exit(1);
  }

  const currentLine = match[0];
  const rawValue = currentLine.slice(currentLine.indexOf("=") + 1).trim();
  const current = rawValue.replace(/^["']|["']$/g, "");

  if (!current) {
    console.error(`${KEY} is empty. Fill it in first.`);
    process.exit(1);
  }

  let fixed: string;
  let note: string;

  if (isWellFormed(current)) {
    // The password is already encoded, so it must not be encoded again.
    const parts = split(current);
    fixed = `${parts.scheme}${parts.user}:${encodeURIComponent(
      decodeURIComponent(parts.password),
    )}@${withSslMode(parts.hostPortPath, SSL_MODE)}`;
    note = "The password was already encoded; only the SSL mode was corrected.";
  } else {
    const parts = split(current);
    fixed = `${parts.scheme}${parts.user}:${encodeURIComponent(
      parts.password,
    )}@${withSslMode(parts.hostPortPath, SSL_MODE)}`;
    note = `The password held ${parts.password.length} characters and is now percent-encoded.`;
  }

  if (fixed === current) {
    console.log(`${KEY} is already correct.`);
    console.log(`  ${mask(current)}`);
    return;
  }

  console.log("Repairing the connection string.");
  console.log(`  before : ${mask(current)}`);
  console.log(`  after  : ${mask(fixed)}`);
  console.log(`\n  ${note}`);
  console.log(`  sslmode is now ${SSL_MODE}.`);

  const quoted = `${KEY}="${fixed}"`;
  const updated = contents.replace(linePattern, quoted);
  await writeFile(ENV_FILE, updated, "utf8");

  console.log(`\n${KEY} in .env has been updated.`);
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Could not fix the connection string.",
  );
  process.exit(1);
});
