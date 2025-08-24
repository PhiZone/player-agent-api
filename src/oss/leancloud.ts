import AV from 'leancloud-storage';
import config from '../../config.json' with { type: 'json' };

const lcConfig = config.oss.leancloud;

if (lcConfig) {
  const options: { appId: string; appKey: string; serverURL?: string } = {
    appId: lcConfig.appId,
    appKey: lcConfig.appKey
  };
  if ('serverURL' in lcConfig) {
    options.serverURL = lcConfig.serverURL;
  }
  AV.init(options);
}

export const uploadToLeanCloud = async (
  name: string,
  buffer: Buffer<ArrayBufferLike>,
  onProgress: (progress: number) => void
) => {
  if (!lcConfig) return;

  const ossFile = await new AV.File(name, buffer).save({
    keepFileName: true,
    onprogress: ({ loaded, total }) => {
      const progress = loaded / total;
      onProgress(progress);
    }
  });
  return ossFile.url();
};
