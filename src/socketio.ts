import type { Server as HttpServer } from 'http';
import type { Server as HttpsServer } from 'https';
import type { Http2SecureServer, Http2Server } from 'http2';
import { Server } from 'socket.io';

export let io: Server;

export const setupSocketIO = (
  server: HttpServer | HttpsServer | Http2SecureServer | Http2Server
) => {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket ${socket.id} connected.`);

    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected.`);
    });
  });
};
