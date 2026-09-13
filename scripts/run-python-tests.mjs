import { spawnSync } from "node:child_process";
import path from "node:path";

const result = spawnSync(
  process.platform === "win32" ? "python" : "python3",
  ["-m", "unittest", "discover", "-s", "tests", "-p", "test_*.py"],
  {
    env: {
      ...process.env,
      PYTHONPATH: path.resolve("src"),
    },
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
