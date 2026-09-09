import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { logger } from "./logger.js";

// ── Storage backend ───────────────────────────────────────────────────────────
// Uses a service account explicitly provisioned for this project.
// via @google-cloud/storage's own credential handling. This is a portable
// service-account key (works identically on Replit and on any other host,
// e.g. Render) — unlike the old approach, which routed every signed-URL
// request through the Replit-only sidecar at 127.0.0.1:1106 and therefore
// failed everywhere else with "make sure you're running on Replit".
let _storageClient: Storage | null = null;
let _bucketName: string | null = null;

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

function getServiceAccount(): FirebaseServiceAccount {
  const raw = process.env.PROJECT_FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "PROJECT_FIREBASE_SERVICE_ACCOUNT is not set. Image uploads require this project's own secret " +
        "(same credential already used for push notifications) so the server can " +
        "authenticate with Firebase/Google Cloud Storage."
    );
  }
  try {
    return JSON.parse(raw) as FirebaseServiceAccount;
  } catch (err) {
    throw new Error("PROJECT_FIREBASE_SERVICE_ACCOUNT is not valid JSON — cannot initialize object storage");
  }
}

function getStorageClient(): Storage {
  if (_storageClient) return _storageClient;
  const serviceAccount = getServiceAccount();
  _storageClient = new Storage({
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
    projectId: serviceAccount.project_id,
  });
  logger.info({ project: serviceAccount.project_id }, "Object storage: initialised Google Cloud Storage client via Firebase service account");
  return _storageClient;
}

function getBucketName(): string {
  if (_bucketName) return _bucketName;
  const explicit = process.env.FIREBASE_STORAGE_BUCKET;
  if (explicit) {
    _bucketName = explicit;
    return _bucketName;
  }
  const serviceAccount = getServiceAccount();
  _bucketName = `${serviceAccount.project_id}.firebasestorage.app`;
  return _bucketName;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

const PRIVATE_PREFIX = "private";
const PUBLIC_PREFIX = "public";

export class ObjectStorageService {
  constructor() {}

  private bucket() {
    return getStorageClient().bucket(getBucketName());
  }

  getPublicObjectSearchPaths(): Array<string> {
    return [PUBLIC_PREFIX];
  }

  getPrivateObjectDir(): string {
    return PRIVATE_PREFIX;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const objectName = `${searchPath}/${filePath}`;
      const file = this.bucket().file(objectName);
      const [exists] = await file.exists();
      if (exists) return file;
    }
    return null;
  }

  async getSignedReadUrl(file: File, ttlSec: number = 3600): Promise<string> {
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + ttlSec * 1000,
    });
    return url;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const objectName = `${PRIVATE_PREFIX}/uploads/${objectId}`;
    const file = this.bucket().file(objectName);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 900 * 1000,
      contentType: "application/octet-stream",
    });
    return url;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/".length);
    const objectName = `${PRIVATE_PREFIX}/${entityId}`;
    const objectFile = this.bucket().file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    let pathname: string;
    try {
      const url = new URL(rawPath);
      pathname = url.pathname;
    } catch {
      // Not a full URL — already a bare path.
      pathname = rawPath;
    }

    // Case 1: already an app-proxy URL, e.g. https://api/api/storage/objects/uploads/<id>
    // (this is what's actually stored in the DB — see routes/menu.ts, routes/drivers.ts).
    const objectsMarker = "/objects/";
    const objIdx = pathname.indexOf(objectsMarker);
    if (objIdx !== -1) {
      return pathname.slice(objIdx);
    }

    // Case 2: a raw GCS URL pointing directly at the private prefix, e.g.
    // https://storage.googleapis.com/<bucket>/private/uploads/<id> or a
    // signed PUT URL for the bucket-relative path /private/uploads/<id>.
    const privateMarker = `/${PRIVATE_PREFIX}/uploads/`;
    const idx = pathname.indexOf(privateMarker);
    if (idx !== -1) {
      const entityId = pathname.slice(idx + privateMarker.length);
      return `/objects/uploads/${entityId}`;
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
