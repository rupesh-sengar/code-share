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

type WebRtcSignalAck = {
  ok: boolean;
  message?: string;
  recipients?: number;
};

type WebRtcFileRequestPayload = {
  room?: string;
  transferId: string;
  filename: string;
  size: number;
  type?: string;
  totalChunks: number;
  chunkSize?: number;
  senderName?: string;
};

type WebRtcReadyPayload = {
  room?: string;
  transferId: string;
  targetId: string;
};

type WebRtcOfferPayload = WebRtcFileRequestPayload & {
  targetId: string;
  description: unknown;
};

type WebRtcAnswerPayload = {
  room?: string;
  transferId: string;
  targetId: string;
  description: unknown;
};

type WebRtcIceCandidatePayload = {
  room?: string;
  transferId: string;
  targetId: string;
  candidate: unknown;
};

type WebRtcCancelPayload = {
  room?: string;
  transferId: string;
  targetId?: string;
  message?: string;
};

type FileRelayChunkPayload = {
  room?: string;
  transferId: string;
  packet: unknown;
};

type FileRelayCompletePayload = {
  room?: string;
  transferId: string;
  totalChunks: number;
  size: number;
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
    "webrtc:file-request",
    (
      payload: WebRtcFileRequestPayload,
      callback?: (ack: WebRtcSignalAck) => void,
    ) => {
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

      socket.to(roomName).emit("webrtc:file-request", {
        ...payload,
        room: roomName,
        senderId: socket.id,
      });
      callback?.({ ok: true, recipients });
    },
  );

  socket.on("webrtc:file-ready", (payload: WebRtcReadyPayload) => {
    if (!payload.targetId) return;

    io.to(payload.targetId).emit("webrtc:file-ready", {
      room: getRoomName(socket, payload.room),
      transferId: payload.transferId,
      receiverId: socket.id,
    });
  });

  socket.on("webrtc:file-offer", (payload: WebRtcOfferPayload) => {
    if (!payload.targetId) return;

    io.to(payload.targetId).emit("webrtc:file-offer", {
      ...payload,
      room: getRoomName(socket, payload.room),
      senderId: socket.id,
    });
  });

  socket.on("webrtc:file-answer", (payload: WebRtcAnswerPayload) => {
    if (!payload.targetId) return;

    io.to(payload.targetId).emit("webrtc:file-answer", {
      room: getRoomName(socket, payload.room),
      transferId: payload.transferId,
      receiverId: socket.id,
      description: payload.description,
    });
  });

  socket.on("webrtc:ice-candidate", (payload: WebRtcIceCandidatePayload) => {
    if (!payload.targetId || !payload.candidate) return;

    io.to(payload.targetId).emit("webrtc:ice-candidate", {
      room: getRoomName(socket, payload.room),
      transferId: payload.transferId,
      fromId: socket.id,
      candidate: payload.candidate,
    });
  });

  socket.on("webrtc:file-cancel", (payload: WebRtcCancelPayload) => {
    const roomName = getRoomName(socket, payload.room);
    const cancelPayload = {
      ...payload,
      room: roomName,
      fromId: socket.id,
    };

    if (payload.targetId) {
      io.to(payload.targetId).emit("webrtc:file-cancel", cancelPayload);
      return;
    }

    if (roomName) {
      socket.to(roomName).emit("webrtc:file-cancel", cancelPayload);
    }
  });

  socket.on(
    "file-relay:start",
    (
      payload: WebRtcFileRequestPayload,
      callback?: (ack: WebRtcSignalAck) => void,
    ) => {
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

      socket.to(roomName).emit("file-relay:start", {
        ...payload,
        room: roomName,
        senderId: socket.id,
      });
      callback?.({ ok: true, recipients });
    },
  );

  socket.on(
    "file-relay:chunk",
    (
      payload: FileRelayChunkPayload,
      callback?: (ack: WebRtcSignalAck) => void,
    ) => {
      const roomName = getRoomName(socket, payload.room);
      if (!roomName) {
        callback?.({ ok: false, message: "Join a room before sharing files." });
        return;
      }

      socket.to(roomName).emit("file-relay:chunk", {
        room: roomName,
        transferId: payload.transferId,
        senderId: socket.id,
        packet: payload.packet,
      });
      callback?.({ ok: true });
    },
  );

  socket.on(
    "file-relay:complete",
    (
      payload: FileRelayCompletePayload,
      callback?: (ack: WebRtcSignalAck) => void,
    ) => {
      const roomName = getRoomName(socket, payload.room);
      if (!roomName) {
        callback?.({ ok: false, message: "Join a room before sharing files." });
        return;
      }

      socket.to(roomName).emit("file-relay:complete", {
        room: roomName,
        transferId: payload.transferId,
        senderId: socket.id,
        totalChunks: payload.totalChunks,
        size: payload.size,
      });
      callback?.({ ok: true });
    },
  );

  socket.on("error", (error: Error) => {
    console.log(`Socket Error: ${error.message}`);
  });
});

export default server;
