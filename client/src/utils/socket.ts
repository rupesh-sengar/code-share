// socket.js
import io from "socket.io-client";

const socket = io("http://localhost:3030");
// const socket = io("https://code-share-backend.onrender.com/"); // Initialize your socket connection here

export default socket;
