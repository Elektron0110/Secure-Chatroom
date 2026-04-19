import { spawn } from "child_process";
import * as http from "http";
import * as path from "path";

// Минимальный HTTP-сервер на порту 5000 — нужен для waitForPort в Replit workflow
const healthServer = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("OK");
});
healthServer.listen(5000, () => {
  console.log("Health check on port 5000");
});

// Flask запускается на порту 8081 — это основной порт превью (externalPort = 80)
const pythonServer = spawn(
  "python",
  [path.resolve(process.cwd(), "server", "app.py")],
  {
    stdio: "inherit",
    env: { ...process.env, PORT: "8081" },
  }
);

pythonServer.on("error", (err) => {
  console.error("Failed to start Python server:", err);
  healthServer.close();
  process.exit(1);
});

pythonServer.on("close", (code) => {
  healthServer.close();
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  pythonServer.kill("SIGINT");
  healthServer.close();
});

process.on("SIGTERM", () => {
  pythonServer.kill("SIGTERM");
  healthServer.close();
});
