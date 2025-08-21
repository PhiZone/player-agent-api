import { createClient } from 'redis';
import config from '../config.json' with { type: 'json' };

class Redis {
  public client;

  constructor() {
    this.client = createClient({
      url: config.redisUrl
    });
    this.client
      .connect()
      .then(() => {
        console.log('[Redis] Connected.');
      })
      .catch((err) => {
        console.error('[Redis] Connection error:', err);
      });
  }

  disconnect() {
    this.client.destroy();
    console.log('[Redis] Disconnected.');
  }
}

const redis = new Redis();
const { client, disconnect } = redis;
export { client as redis, disconnect };
export default redis;
