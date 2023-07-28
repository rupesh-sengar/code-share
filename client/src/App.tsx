import React, { useState, useEffect } from "react";
import socketio from "socket.io-client";
import ThemeProvider from "./components/theme-provider/theme-provider";
import "./App.scss";
import Layout from "./layout/layout";

const App = () => {
  const [messages, setMessages] = useState<string>();

  const socket = socketio("http://localhost:3001");

  useEffect(() => {
    socket.on("receive_msg", (data) => {
      console.log(data);
      setMessages(data);
    });
  }, []);

  const handleSubmit = (event: any) => {
    const message = event.target.value;
    console.log(event);
    console.log(message);
    socket.emit("message", message);
  };

  const handleChange = (event: any) => {
    const message = event.target.value;
    console.log(event);
    console.log(message);
    socket.emit("message", message);
  };

  return (
    <ThemeProvider>
      {/* <div className="root-container">
        <h1 className="heading">Socket.io with Realtime Database</h1>
        <input id="message" onChange={handleChange} />
        <button className="submit-button" onClick={handleSubmit}>
          Send
        </button>
        <ul>{messages}</ul>
      </div> */}
      <Layout></Layout>
    </ThemeProvider>
  );
};

export default App;
