const express = require("express");
const app = express();

const http = require("http");

const { Server } = require("socket.io");
const cors = require("cors");

app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("a user connected: ", socket.id);
  socket.on("message", (msg) => {
    console.log(msg);
    socket.broadcast.emit("receive_msg", msg);
  });
  socket.on("error", (error) => {
    console.log(`Socket Error: ${error.message}`);
  });
});

server.listen(3001, () => {
  console.log("listening on *:3001");
});