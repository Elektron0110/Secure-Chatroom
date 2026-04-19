import { spawn } from "child_process";
import * as path from "path";

const log = console.log;

const pythonServer = spawn("python", [path.resolve(process.cwd(), "server", "app.py")], {
  stdio: "inherit",
  env: { ...process.env },
});

pythonServer.on("error", (err) => {
  console.error("Failed to start Python server:", err);
  process.exit(1);
});

pythonServer.on("close", (code) => {
  log(`Python server exited with code ${code}`);
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  pythonServer.kill("SIGINT");
});

process.on("SIGTERM", () => {
  pythonServer.kill("SIGTERM");
});
