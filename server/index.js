const express = require("express");
const app = express();

const http = require("http");

const { Server } = require("socket.io");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

app.use(cors());
const server = http.createServer(app);

console.log(process.env.CLIENT_URL);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected: ", socket.id);

  socket.on("join_room", (data) => {
    socket.join(data.room);
    console.log("Type of Room: ", typeof room);
    console.log(`${data.user} joined room: ${data.room}`);
  });

  socket.on("joined_user", (data) => {
    console.log("joined_user is called", data);
    socket.to(data.room).emit("joined_room", data.user);
  });
  socket.on("message", (data) => {
    console.log(data);
    socket.to(data.room).emit("receive_msg", data);
  });

  socket.on("typing", (data) => {
    socket.to(data.room).emit("typing", data);
  });

  socket.on("error", (error) => {
    console.log(`Socket Error: ${error.message}`);
  });
});

server.listen(3001, () => {
  console.log("listening on *:3001");
});
