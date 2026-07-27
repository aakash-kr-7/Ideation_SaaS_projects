import "dotenv/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { exec, restartLocalSupabase } from "./support/command-runner.mjs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("Supabase URL, anonymous key, and service-role key are required.");
}

const artifactDir = path.resolve("artifacts/restore-rehearsal");
await mkdir(artifactDir, { recursive: true });
const results = { startedAt: new Date().toISOString(), steps: [] };
const testPassword = `Restore!${crypto.randomUUID()}`;
const assetBytes = new TextEncoder().encode(`representative-user-asset:${crypto.randomUUID()}`);
const exportBytes = new TextEncoder().encode(`representative-export:${crypto.randomUUID()}`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function step(name, passed, detail) {
  results.steps.push({ name, passed, detail });
  console.log(`  ${passed ? "PASS" : "FAIL"} ${name}: ${detail}`);
  if (!passed) throw new Error(`${name}: ${detail}`);
}

function adminClient() {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function userClient() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createTenant(admin, label, password) {
  const email = `restore-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Restore ${label}` },
  });
  if (error || !data.user) throw error || new Error(`Unable to create ${label} restore user.`);
  const { data: membership, error: membershipError } = await admin.from("team_members")
    .select("team_id")
    .eq("user_id", data.user.id)
    .single();
  if (membershipError || !membership) throw membershipError || new Error(`Missing ${label} team.`);
  const projectName = `Representative ${label} project`;
  const { data: project, error: projectError } = await admin.from("projects").insert({
    team_id: membership.team_id,
    name: projectName,
    description: `Encrypted restore rehearsal ${label} tenant data`,
    created_by: data.user.id,
  }).select("id,name,description").single();
  if (projectError || !project) throw projectError || new Error(`Unable to create ${label} project.`);
  return { email, password, userId: data.user.id, teamId: membership.team_id, project };
}

async function signIn(email, password) {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function encryptBackup(payload) {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    key,
    envelope: {
      version: 1,
      algorithm: "AES-256-GCM",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      plaintextSha256: sha256(plaintext),
    },
  };
}

function decryptBackup(key, envelope) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  if (sha256(plaintext) !== envelope.plaintextSha256) throw new Error("Encrypted backup checksum mismatch.");
  return JSON.parse(plaintext.toString("utf8"));
}

let restoredUsers = [];
try {
  const before = adminClient();
  const victim = await createTenant(before, "victim", testPassword);
  const attacker = await createTenant(before, "attacker", testPassword);
  const victimClient = await signIn(victim.email, victim.password);
  const assetPath = `${victim.userId}/restore-proof.png`;
  const exportPath = `${victim.userId}/restore-proof.json`;
  const assetUpload = await victimClient.storage.from("user-assets").upload(assetPath, assetBytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (assetUpload.error) throw assetUpload.error;
  const exportUpload = await before.storage.from("exports").upload(exportPath, exportBytes, {
    contentType: "application/json",
    upsert: true,
  });
  if (exportUpload.error) throw exportUpload.error;
  step("representative_data_created", true, "two isolated tenants, projects, owner asset, and export object");

  const payload = {
    createdAt: new Date().toISOString(),
    tenants: [
      { label: "victim", email: victim.email, password: victim.password, project: victim.project },
      { label: "attacker", email: attacker.email, password: attacker.password, project: attacker.project },
    ],
    objects: [
      { bucket: "user-assets", owner: "victim", suffix: "restore-proof.png", contentType: "image/png", bytes: Buffer.from(assetBytes).toString("base64"), sha256: sha256(assetBytes) },
      { bucket: "exports", owner: "victim", suffix: "restore-proof.json", contentType: "application/json", bytes: Buffer.from(exportBytes).toString("base64"), sha256: sha256(exportBytes) },
    ],
  };
  const encrypted = await encryptBackup(payload);
  const backupPath = path.join(artifactDir, "representative-backup.aes256gcm.json");
  await writeFile(backupPath, `${JSON.stringify(encrypted.envelope, null, 2)}\n`, "utf8");
  step("encrypted_backup_created", true, `${backupPath}; plaintext SHA-256 ${encrypted.envelope.plaintextSha256}`);

  await exec("npx", ["supabase", "db", "reset"]);
  await restartLocalSupabase({ serveFunctions: true });
  step("destructive_reset_completed", true, "local database and Storage were recreated from migrations");

  const restoredPayload = decryptBackup(encrypted.key, encrypted.envelope);
  step("encrypted_backup_authenticated", true, "AES-256-GCM authentication and plaintext checksum passed");

  const after = adminClient();
  const restored = {};
  for (const tenant of restoredPayload.tenants) {
    const created = await createTenant(after, tenant.label, tenant.password);
    restored[tenant.label] = created;
    restoredUsers.push(created.userId);
  }
  for (const object of restoredPayload.objects) {
    const owner = restored[object.owner];
    const objectPath = `${owner.userId}/${object.suffix}`;
    const upload = await after.storage.from(object.bucket).upload(
      objectPath,
      Buffer.from(object.bytes, "base64"),
      { contentType: object.contentType, upsert: true },
    );
    if (upload.error) throw upload.error;
    object.restoredPath = objectPath;
  }
  step("representative_data_restored", true, "tenant records and both Storage objects restored");

  const restoredVictimClient = await signIn(restored.victim.email, restored.victim.password);
  const restoredAttackerClient = await signIn(restored.attacker.email, restored.attacker.password);
  const { data: victimProjects, error: victimProjectsError } = await restoredVictimClient.from("projects")
    .select("id,name,description")
    .eq("name", "Representative victim project");
  const { data: attackerSeesVictim, error: attackerReadError } = await restoredAttackerClient.from("projects")
    .select("id")
    .eq("name", "Representative victim project");
  step(
    "post_restore_tenant_isolation",
    !victimProjectsError && !attackerReadError && victimProjects?.length === 1 && attackerSeesVictim?.length === 0,
    `owner rows ${victimProjects?.length ?? 0}; cross-tenant rows ${attackerSeesVictim?.length ?? 0}`,
  );

  for (const object of restoredPayload.objects) {
    const ownerDownload = await restoredVictimClient.storage.from(object.bucket).download(object.restoredPath);
    if (ownerDownload.error || !ownerDownload.data) throw ownerDownload.error || new Error(`Owner download failed for ${object.bucket}.`);
    const restoredBytes = Buffer.from(await ownerDownload.data.arrayBuffer());
    step(`${object.bucket}_checksum`, sha256(restoredBytes) === object.sha256, object.sha256);
    const attackerDownload = await restoredAttackerClient.storage.from(object.bucket).download(object.restoredPath);
    step(`${object.bucket}_cross_tenant_denial`, Boolean(attackerDownload.error), attackerDownload.error?.message || "unexpected access");
  }

  const buckets = await after.storage.listBuckets();
  const bucketNames = (buckets.data || []).map((bucket) => bucket.id).sort();
  step("buckets_restored", !buckets.error && bucketNames.join(",") === "cached-sources,exports,user-assets", bucketNames.join(","));

  results.result = "PASS";
  results.backup = {
    encrypted: true,
    algorithm: encrypted.envelope.algorithm,
    plaintextPersisted: false,
    plaintextSha256: encrypted.envelope.plaintextSha256,
    representativeTenants: 2,
    representativeStorageObjects: 2,
  };
} catch (error) {
  results.result = "FAIL";
  results.error = error instanceof Error ? error.message : String(error);
} finally {
  const cleanup = adminClient();
  for (const userId of restoredUsers) await cleanup.auth.admin.deleteUser(userId).catch(() => undefined);
  results.completedAt = new Date().toISOString();
  const outputPath = path.join(artifactDir, "restore-rehearsal-result.json");
  await writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ result: results.result, outputPath, steps: results.steps.length }, null, 2));
  if (results.result !== "PASS") process.exitCode = 1;
}
