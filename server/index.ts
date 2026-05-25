import { spawn } from "child_process";
import * as path from "path";

// Flask запускается на порту 5000 (externalPort=5000 в .replit)
// waitForPort=5000 в воркфлоу "Start Backend" будет выполнен Flask-ом напрямую
const pythonServer = spawn(
  "python",
  [path.resolve(process.cwd(), "server", "app.py")],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: "5000" },
  }
);

pythonServer.on("error", (err) => {
  console.error("Failed to start Python server:", err);
  process.exit(1);
});

pythonServer.on("close", (code) => {
  process.exit(code || 0);
});

process.on("SIGINT", () => pythonServer.kill("SIGINT"));
process.on("SIGTERM", () => pythonServer.kill("SIGTERM"));
