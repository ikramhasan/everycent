import {
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectStorage, ServeOptions } from "./index";

export interface S3StorageOptions {
  bucket: string;
  /** Unset for AWS itself; on Railway, the bucket's ENDPOINT variable (e.g. `https://t3.storageapi.dev`). */
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Path-style URLs (`endpoint/bucket/key`), for older Railway buckets and MinIO. */
  forcePathStyle: boolean;
}

/** How long a download link works. The register asks again for each view. */
const SIGNED_URL_SECONDS = 5 * 60;

/** S3's limit on keys per DeleteObjects call. */
const DELETE_BATCH = 1000;

/** `filename*` per RFC 6266/5987, so any name survives; `filename` as an ASCII fallback. */
export function contentDisposition(fileName: string, download: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * An S3-compatible bucket (Railway Buckets in production). Buckets are private: the browser
 * reads an object through a presigned URL (bucket egress is free on Railway; the API's isn't).
 */
export class S3Storage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #bucket: string;

  constructor(options: S3StorageOptions) {
    this.#bucket = options.bucket;
    this.#client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  async get(key: string) {
    try {
      const out = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key }));
      return out.Body ? await out.Body.transformToByteArray() : null;
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      throw e;
    }
  }

  async signedUrl(
    key: string,
    { fileName, contentType, download, expiresInSeconds = SIGNED_URL_SECONDS }: ServeOptions,
  ) {
    return getSignedUrl(
      this.#client,
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(fileName, download),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async delete(keys: readonly string[]) {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      const out = await this.#client.send(
        new DeleteObjectsCommand({
          Bucket: this.#bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      const failed = out.Errors?.filter((e) => e.Code !== "NoSuchKey") ?? [];
      if (failed.length > 0) {
        throw new Error(
          `Couldn't delete ${failed.length} object(s): ${failed.map((e) => `${e.Key} (${e.Code})`).join(", ")}`,
        );
      }
    }
  }
}
