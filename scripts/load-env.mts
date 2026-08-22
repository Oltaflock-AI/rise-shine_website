import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load `.env.local` the way Next does, for scripts run under plain tsx.
 *
 * A naive `KEY=VALUE` split is not enough. Next runs dotenv + dotenv-expand, so
 * a value can be quoted and can escape a `$`. `TBO_PASSWORD` is BOTH — it is
 * written `'Ri\$e-amD3#6'` — and passing the quotes or the backslash through
 * makes TBO answer `Status 4 · "Incorrect Username or Password"`, which reads
 * like revoked credentials rather than a parsing bug. Strip the quotes, then
 * drop the escape, exactly as dotenv-expand does.
 */
export function loadEnvLocal(root = join(import.meta.dirname, "..")): void {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2]
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, "$2")
      .replace(/\\\$/g, "$");
  }
}
