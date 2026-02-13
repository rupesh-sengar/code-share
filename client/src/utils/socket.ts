// socket.js
import io from "socket.io-client";

// const socket = io("http://localhost:3001");
const socket = io("https://code-share-backend.onrender.com/", {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ["websocket", "polling"],
}); // Initialize your socket connection here

export default socket;
