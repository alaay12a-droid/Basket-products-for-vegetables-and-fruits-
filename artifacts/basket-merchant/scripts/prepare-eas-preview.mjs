import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Produce an isolated upload tree. Never change the customer/driver .easignore.
// Credentials, other apps and generated binaries are not uploaded to Expo.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(appRoot, "../..");
const stagingName = process.argv[2] ?? "merchant-eas-upload";
if (!/^[a-z0-9-]+$/.test(stagingName)) throw new Error("Use a simple lowercase staging directory name.");
const destination = path.join(root, "generated-artifacts", stagingName);
const deniedNames = new Set(["node_modules", ".git", ".gradle", "dist", ".expo", ".replit-artifact"]);
const deniedFile = /(?:^\.env(?:\.|$)|\.(?:p8|p12|pem|jks|keystore|mobileprovision|apk|aab|log)$|^(?:credentials|google-services|.*service-account.*|.*firebase-adminsdk.*)\.json$|^local\.properties$)/i;
const filter = (source) => {
  const name = path.basename(source);
  return !deniedNames.has(name) && !(name === "build" && path.basename(path.dirname(source)) !== ".eas") && !deniedFile.test(name)
    && !source.endsWith(path.join("src", "main", "assets", "public"));
};

await mkdir(destination, { recursive: true });
const entries = await readdir(destination);
if (entries.length) throw new Error("Upload directory already exists; choose a fresh staging directory before preparing another archive.");
for (const relative of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".npmrc", "tsconfig.json", "tsconfig.base.json"]) {
  try {
    await cp(path.join(root, relative), path.join(destination, relative));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
for (const relative of ["artifacts/basket-merchant", "lib/api-client-react", "lib/api-zod", "lib/db"]) {
  await cp(path.join(root, relative), path.join(destination, relative), { recursive: true, filter });
}
// The staged root must not reference the customer app in npm workspace metadata.
const pkgPath = path.join(destination, "package.json");
const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
delete pkg.workspaces;
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
await writeFile(path.join(destination, ".easignore"), [
  "**/node_modules/", "**/.git/", "**/.gradle/", "**/android/**/build/", "**/dist/",
  "**/.env", "**/.env.*", "**/*.p8", "**/*.p12", "**/*.pem", "**/*.jks",
  "**/*.keystore", "**/credentials.json", "**/local.properties",
  "**/google-services.json", "**/*service-account*.json", "**/*firebase-adminsdk*.json",
  "",
].join("\n"));
console.log("Isolated merchant-only EAS upload tree prepared:", destination);
