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
    const joinedRooms = new Set<string>();

    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected.`);
      joinedRooms.forEach((room) => {
        io.to(room).emit('left', socket.id, io.sockets.adapter.rooms.get(room)?.size || 0);
      });
    });

    socket.on('join', (prefix: string, user: string, hrid: string) => {
      const room = `${prefix}/${user}/${hrid}`;
      socket.join(room);
      joinedRooms.add(room);
      console.log(`Socket ${socket.id} joined ${room}.`);
      io.to(room).emit('joined', socket.id, io.sockets.adapter.rooms.get(room)?.size || 0);
    });

    socket.on('leave', (prefix: string, user: string, hrid: string) => {
      const room = `${prefix}/${user}/${hrid}`;
      socket.leave(room);
      joinedRooms.delete(room);
      console.log(`Socket ${socket.id} left ${room}.`);
      io.to(room).emit('left', socket.id, io.sockets.adapter.rooms.get(room)?.size || 0);
    });
  });
};
