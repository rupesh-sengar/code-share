// socket.js
import io from "socket.io-client";

const PRD_URL = "https://code-share-backend.onrender.com/";
//const socket = io("http://localhost:3001");
const socket = io(PRD_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ["websocket", "polling"],
}); // Initialize your socket connection here

export default socket;
