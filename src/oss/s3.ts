import config from '../../config.json' with { type: 'json' };
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

let s3: S3Client | undefined = undefined;
export let isS3Initialized = false;

const s3Config: S3Config | undefined =
  's3' in config.oss && typeof config.oss.s3 === 'object' ? (config.oss.s3 as S3Config) : undefined;

if (s3Config) {
  s3 = new S3Client({
    region: s3Config.region,
    endpoint: s3Config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: s3Config.accessKeyId,
      secretAccessKey: s3Config.secretAccessKey
    }
  });

  isS3Initialized = true;
}

export const uploadToS3 = async (
  name: string,
  buffer: Buffer<ArrayBufferLike>,
  onProgress: (progress: number) => void
) => {
  if (!s3Config || !s3) return;

  const upload = new Upload({
    client: s3,
    params: {
      Bucket: s3Config.bucket,
      Key: name,
      Body: buffer,
      ContentType: 'application/octet-stream'
    }
  });

  upload.on('httpUploadProgress', (progress) => {
    if (progress.loaded && progress.total) {
      const progressPercent = progress.loaded / progress.total;
      onProgress(progressPercent);
    }
  });

  await upload.done();
  onProgress(1); // Ensure we reach 100%

  return `${s3Config.endpoint}/${s3Config.bucket}/${name}`;
};
