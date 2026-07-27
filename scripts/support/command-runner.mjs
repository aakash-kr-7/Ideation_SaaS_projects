import { spawn } from "node:child_process";

export function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const cmd = isWindows && (command === "npx" || command === "npm") ? `${command}.cmd` : command;
    
    const child = spawn(cmd, args, { 
      cwd: process.cwd(), 
      env: process.env, 
      stdio: options.stdio || "inherit", 
      windowsHide: true,
      shell: isWindows
    });
    
    let stdout = "";
    let stderr = "";
    
    if (child.stdout) child.stdout.on("data", (data) => { stdout += data.toString(); });
    if (child.stderr) child.stderr.on("data", (data) => { stderr += data.toString(); });
    
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Exit ${code}: ${stderr || stdout}`));
      }
    });
  });
}

export async function restartLocalSupabase({ serveFunctions = false } = {}) {
  await exec("npx", ["supabase", "stop"]);
  await exec("npx", ["supabase", "start"]);
  if (!serveFunctions) return;
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec || "cmd.exe") : "npx";
  const args = isWindows
    ? ["/d", "/s", "/c", "npx.cmd supabase functions serve --env-file supabase/functions/.env.local"]
    : ["supabase", "functions", "serve", "--env-file", "supabase/functions/.env.local"];
  const functions = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
    detached: true,
  });
  functions.unref();
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
