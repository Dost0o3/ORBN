/**
 * Normalize legacy profile photos & cover images.
 *
 * One-shot CLI wrapper around the shared
 * `@workspace/profile-image-normalizer` library. The api-server runs the same
 * sweep on a recurring schedule in production
 * (see `artifacts/api-server/src/lib/profile-image-cleanup.ts`); this CLI is
 * here for ad-hoc debugging and one-off backfills.
 *
 * Run with: pnpm --filter @workspace/scripts run normalize-profile-images
 *   --dry-run   show what would change without writing
 *   --user=<id> only process a single user id (debugging)
 */
import { runNormalizeProfileImages } from "@workspace/profile-image-normalizer";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const userArg = args.find((a) => a.startsWith("--user="));
  const onlyUserId = userArg ? userArg.slice("--user=".length) : null;

  console.log(
    `[normalize-profile-images] ${dryRun ? "DRY RUN — " : ""}starting sweep`,
  );

  const totals = await runNormalizeProfileImages({
    dryRun,
    onlyUserId,
    onProgress: ({ owner, kind, result }) => {
      if (result.status === "rewritten") {
        console.log(
          `  ${owner} ${kind}: ${result.beforeBytes ?? "?"}B → ${
            result.afterBytes ?? "?"
          }B`,
        );
      } else if (result.status === "failed") {
        console.warn(`  ${owner} ${kind}: FAILED — ${result.reason}`);
      }
    },
  });

  console.log(
    [
      "",
      `[normalize-profile-images] done${dryRun ? " (dry run)" : ""}`,
      `  users scanned:       ${totals.usersScanned}`,
      `  communities scanned: ${totals.communitiesScanned}`,
      `  rewritten:           ${totals.rewritten}`,
      `  already normalized:  ${totals.skippedAlreadyNormalized}`,
      `  external (skipped):  ${totals.skippedExternal}`,
      `  missing (skipped):   ${totals.skippedMissing}`,
      `  failed:              ${totals.failed}`,
      `  bytes before/after:  ${totals.bytesBefore} → ${totals.bytesAfter} (${
        totals.bytesBefore > 0
          ? `${Math.round((1 - totals.bytesAfter / totals.bytesBefore) * 100)}% saved`
          : "n/a"
      })`,
    ].join("\n"),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[normalize-profile-images] fatal:", err);
    process.exit(1);
  });
