import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

function exec(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const cmd = isWindows && (command === "npx" || command === "npm") ? `${command}.cmd` : command;
    const child = spawn(cmd, args, { cwd: process.cwd(), env: process.env, stdio: "pipe", windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.on("data", (data) => { stdout += data.toString(); });
    if (child.stderr) child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function runTests() {
  const scannerPath = path.resolve("scripts/check-secret-leaks.mjs");
  
  // 1. Should pass: secret name reference
  const pass1 = "const name = 'GEMINI_API_KEY';";
  writeFileSync("tests/pass1.mjs", pass1);
  
  // 2. Should pass: placeholder
  const pass2 = "const GEMINI_API_KEY = '<YOUR_API_KEY>';";
  writeFileSync("tests/pass2.mjs", pass2);

  // 3. Should fail: realistic hard-coded secret
  const fail1 = "const SUPABASE_SERVICE_ROLE_KEY = 'AIzaSyA_abcdefghijklmnopqrstuvwxyz12345';";
  writeFileSync("tests/fail1.mjs", fail1);

  // 4. Should fail: browser-exposed secret variable
  const fail2 = "const NEXT_PUBLIC_GEMINI_API_KEY = 'AIzaSyA_abcdefghijklmnopqrstuvwxyz12345';";
  writeFileSync("tests/fail2.mjs", fail2);

  // 5. Should pass: string containing word password not being logged as variable
  const pass3 = 'console.log("Testing wrong password");';
  writeFileSync("tests/pass3.mjs", pass3);
  
  // 6. Should fail: possible secret logging
  const fail3 = 'console.log("Key is", GEMINI_API_KEY);';
  writeFileSync("tests/fail3.mjs", fail3);

  const { code: _code, stderr, stdout } = await exec("node", [scannerPath]);

  try {
    unlinkSync("tests/pass1.mjs");
    unlinkSync("tests/pass2.mjs");
    unlinkSync("tests/fail1.mjs");
    unlinkSync("tests/fail2.mjs");
    unlinkSync("tests/pass3.mjs");
    unlinkSync("tests/fail3.mjs");
  } catch {}

  const output = stderr || stdout;

  const passes = !output.includes("pass1") && !output.includes("pass2") && !output.includes("pass3");
  const fails = output.includes("fail1") && output.includes("fail2") && output.includes("fail3");
  const noValuesPrinted = !output.includes("AIzaSyA_abcdefghijklmnopqrstuvwxyz12345");
  
  if (passes && fails && noValuesPrinted) {
    console.log("Secret scanner tests passed!");
    process.exitCode = 0;
  } else {
    console.error("Secret scanner tests failed!");
    console.error(`passes logic: ${passes}, fails logic: ${fails}, noValuesPrinted: ${noValuesPrinted}`);
    console.error("Scanner Output:\n", output);
    process.exitCode = 1;
  }
}

runTests();
