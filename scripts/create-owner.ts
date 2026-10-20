import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

/**
 * Provisions the single owner account.
 *
 * Public sign-up is disabled (`disableSignUp: true` in src/lib/auth.ts), so this
 * is the only way the owner account is created. Credentials are read from the
 * environment and never hardcoded. The password is hashed with Argon2id and the
 * hash is stored on the `account` row (Better Auth credential provider).
 */
async function main() {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.OWNER_PASSWORD;

  if (!email || !password) {
    console.error(
      "OWNER_EMAIL and OWNER_PASSWORD must be set in the environment.",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("OWNER_PASSWORD must be at least 8 characters long.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`An owner account for ${email} already exists.`);
    process.exit(1);
  }

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      id: userId,
      name: "Owner",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: passwordHash,
        },
      },
    },
  });

  console.log(`Owner account created for ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
