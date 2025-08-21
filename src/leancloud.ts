import AV from 'leancloud-storage';
import config from '../config.json' with { type: 'json' };

AV.init({
  appId: config.leancloud.appId,
  appKey: config.leancloud.appKey,
  serverURL: config.leancloud.serverURL
});

export default AV;
