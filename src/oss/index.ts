import { uploadToLeanCloud } from './leancloud.js';

export const upload = async (
  name: string,
  buffer: Buffer<ArrayBufferLike>,
  onProgress: (progress: number) => void
) =>
  (await uploadToLeanCloud(name, buffer, onProgress)) ||
  (() => {
    throw new Error('No OSS provider available');
  })();
