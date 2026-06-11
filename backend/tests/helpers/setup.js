import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "../..");

export default async function () {
  const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5433/docchat_test";
  execSync("npx prisma migrate deploy", {
    cwd: backendDir,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}
