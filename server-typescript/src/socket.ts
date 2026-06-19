import express from "express";
import { Server, Socket } from "socket.io";
import cors from "cors";
import { CLIENT_URL } from "./config";
import { createServer } from "http";
import router from "./routes/code.route";
import { setupWSConnection } from "@y/websocket-server/src/utils";
import { getOrCreateDoc } from "./yjs-server";
import * as Y from "yjs";

const app: express.Application = express();
const server = createServer(app);

type FileTransferAck = {
  ok: boolean;
  message?: string;
  recipients?: number;
};

type FileTransferPayload = {
  room?: string;
  transferId: string;
  filename: string;
  size: number;
  type?: string;
  totalChunks: number;
  chunkSize?: number;
  senderName?: string;
};

type FileChunkPayload = FileTransferPayload & {
  chunkIndex: number;
  chunk: ArrayBuffer | Uint8Array | number[];
};

type FileReadyPayload = {
  room?: string;
  transferId: string;
  senderId: string;
};

type FileChunkAckPayload = {
  room?: string;
  transferId: string;
  chunkIndex: number;
  senderId: string;
};

type FileCancelPayload = {
  room?: string;
  transferId: string;
  message?: string;
};

const getRoomName = (socket: Socket, room?: string) => room ?? socket.data.room;

app.use(express.json());
app.use("/", router);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected: ", socket.id);

  socket.on("handshake", () => {
    socket.emit("heartbeat", { message: "handshake established" });
  });

  socket.on("join_room", ({ room }) => {
    const prevRoom = socket.data.room;
    if (prevRoom && prevRoom !== room) socket.leave(prevRoom);

    socket.join(room);
    socket.data.room = room;

    const doc = getOrCreateDoc(room);
    socket.emit("sync", Y.encodeStateAsUpdate(doc));
  });

  socket.on("update", (payload) => {
    const update = payload?.update ?? payload;
    const roomName = payload?.room ?? socket.data.room;
    if (!roomName || !update) return;

    const doc = getOrCreateDoc(roomName);
    const bytes =
      update instanceof Uint8Array ? update : new Uint8Array(update);
    Y.applyUpdate(doc, bytes);
    socket.to(roomName).emit("update", bytes);
  });

  socket.on("awareness", (update: Uint8Array | number[]) => {
    const roomName = socket.data.room;
    if (roomName) {
      socket.to(roomName).emit("awareness", update);
    }
  });

  socket.on("joined_user", (data: { user: string; room: string }) => {
    console.log("joined_user is called", data);
    socket.to(data.room).emit("joined_room", data.user);
  });

  socket.on("message", (data: { room: string; message: string }) => {
    socket.to(data.room).emit("receive_msg", data);
  });

  socket.on("typing", (data: { room: string; user: string }) => {
    socket.to(data.room).emit("typing", data);
  });

  socket.on("video-player-message", (data) => {
    console.log("video-player-message", data);
    socket.to(data.room).emit("video-player-message", data);
  });

  socket.on(
    "file:offer",
    (payload: FileTransferPayload, callback?: (ack: FileTransferAck) => void) => {
      const roomName = getRoomName(socket, payload.room);
      if (!roomName) {
        callback?.({ ok: false, message: "Join a room before sharing files." });
        return;
      }

      const roomSockets = io.sockets.adapter.rooms.get(roomName);
      const recipients = Math.max((roomSockets?.size ?? 0) - 1, 0);
      if (recipients === 0) {
        callback?.({ ok: false, message: "No other users are in this room." });
        return;
      }

      socket.to(roomName).emit("file:offer", {
        ...payload,
        room: roomName,
        senderId: socket.id,
      });
      callback?.({ ok: true, recipients });
    },
  );

  socket.on("file:ready", (payload: FileReadyPayload) => {
    const roomName = getRoomName(socket, payload.room);
    if (!roomName || !payload.senderId) return;

    io.to(payload.senderId).emit("file:ready", {
      room: roomName,
      transferId: payload.transferId,
      receiverId: socket.id,
    });
  });

  socket.on(
    "file:chunk",
    (payload: FileChunkPayload, callback?: (ack: FileTransferAck) => void) => {
      const roomName = getRoomName(socket, payload.room);
      if (!roomName) {
        callback?.({ ok: false, message: "Join a room before sharing files." });
        return;
      }

      socket.to(roomName).emit("file:chunk", {
        ...payload,
        room: roomName,
        senderId: socket.id,
      });
      callback?.({ ok: true });
    },
  );

  socket.on("file:chunk-ack", (payload: FileChunkAckPayload) => {
    if (!payload.senderId) return;

    io.to(payload.senderId).emit("file:chunk-ack", {
      room: getRoomName(socket, payload.room),
      transferId: payload.transferId,
      chunkIndex: payload.chunkIndex,
      receiverId: socket.id,
    });
  });

  socket.on("file:complete", (payload: FileCancelPayload) => {
    const roomName = getRoomName(socket, payload.room);
    if (!roomName) return;

    socket.to(roomName).emit("file:complete", {
      ...payload,
      room: roomName,
      senderId: socket.id,
    });
  });

  socket.on("file:cancel", (payload: FileCancelPayload) => {
    const roomName = getRoomName(socket, payload.room);
    if (!roomName) return;

    socket.to(roomName).emit("file:cancel", {
      ...payload,
      room: roomName,
      senderId: socket.id,
    });
  });

  socket.on("error", (error: Error) => {
    console.log(`Socket Error: ${error.message}`);
  });
});

export default server;
