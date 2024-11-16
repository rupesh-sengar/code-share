import express from "express";
import { Server } from "socket.io";
import cors from "cors";
import { CLIENT_URL } from "./config";
import { createServer } from "http";
import router from "./routes/code.route";

const app: express.Application = express();
const server = createServer(app);

app.use(express.json());
app.use("/", router);

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected: ", socket.id);
  socket.on("handshake", () => {
    console.log(new Date(), "handshake established");
    socket.emit("heartbeat", { message: "handshake established" });
  });
  socket.on("join_room", (data: { user: string; room: string }) => {
    socket.join(data.room);
    console.log("User: ", data.user, "joined room:", data.room);
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
