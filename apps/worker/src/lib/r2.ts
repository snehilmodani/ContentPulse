import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretKey: string;
  bucketName: string;
  publicUrl: string;
  localRoot: string;
  localPublicUrl: string;
}

export class R2StorageClient {
  private readonly s3: S3Client | null;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly localRoot: string;
  private readonly localPublicUrl: string;

  constructor(config: R2Config) {
    this.bucketName = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.localRoot = config.localRoot;
    this.localPublicUrl = config.localPublicUrl;

    if (config.accountId && config.accessKeyId && config.secretKey) {
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretKey,
        },
      });
    } else {
      this.s3 = null;
      fs.mkdirSync(this.localRoot, { recursive: true });
    }
  }

  async upload(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string> {
    if (!this.s3) {
      const filePath = path.join(this.localRoot, key);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, body);
      return `${this.localPublicUrl}/${key}`;
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return this.publicUrl ? `${this.publicUrl}/${key}` : `https://${this.bucketName}/${key}`;
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 86400): Promise<string> {
    if (!this.s3) {
      return `${this.localPublicUrl}/${key}`;
    }

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucketName, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
