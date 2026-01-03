import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import { CLIENT_URL } from "./config";
import { createServer } from "http";
import router from "./routes/code.route";
import { setupWSConnection } from "@y/websocket-server/src/utils";
import { getOrCreateDoc } from "./yjs-server";
import * as Y from "yjs";

const app: express.Application = express();
const server = createServer(app);

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

  socket.on("error", (error: Error) => {
    console.log(`Socket Error: ${error.message}`);
  });
});

export default server;
