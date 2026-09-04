import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const bundledCodex = "/Applications/ChatGPT.app/Contents/Resources/codex";

async function codexBinary() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  try {
    await access(bundledCodex);
    return bundledCodex;
  } catch {
    return "codex";
  }
}

export async function codexVersion() {
  const binary = await codexBinary();
  return await new Promise<string>((resolve, reject) => {
    const child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error || "Codex CLI is unavailable")));
  });
}

export async function runCodexStructured<T>(prompt: string, schemaFile: string): Promise<T> {
  const binary = await codexBinary();
  const workDirectory = process.cwd();
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "persona-codex-"));
  const outputFile = path.join(tempDirectory, "result.json");
  const schemaPath = path.join(workDirectory, "lib", "agent", schemaFile);
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-rules",
    "--sandbox", "read-only",
    "--skip-git-repo-check",
    "--color", "never",
    "--output-schema", schemaPath,
    "--output-last-message", outputFile,
    "-C", workDirectory,
  ];
  if (process.env.CODEX_MODEL) args.push("--model", process.env.CODEX_MODEL);
  args.push("-");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ["pipe", "ignore", "pipe"], env: process.env });
      let error = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error("The local agent took longer than two minutes."));
      }, 120_000);
      child.stderr.on("data", (chunk: Buffer) => {
        error += chunk.toString();
        if (error.length > 12_000) error = error.slice(-12_000);
      });
      child.on("error", (cause) => { clearTimeout(timer); reject(cause); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(error.trim() || `Codex exited with status ${code ?? "unknown"}.`));
      });
      child.stdin.end(prompt);
    });
    return JSON.parse(await readFile(outputFile, "utf8")) as T;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
