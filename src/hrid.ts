import config from '../config.json' with { type: 'json' };

export const hrid = (client?: string) => {
  const idPool = (client && config.clients.find((c) => c.name === client)?.idPool) || config.idPool;
  return idPool[Math.floor(Math.random() * idPool.length)];
};
