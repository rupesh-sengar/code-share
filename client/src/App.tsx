import ThemeProvider from "./components/theme-provider/theme-provider";
import "./App.scss";
import Layout from "./layout/layout";
import socket from "./utils/socket";
import { useEffect } from "react";

const App = () => {
  useEffect(() => {
    const interval = setInterval(() => {
      if (socket.connected) {
        socket.emit("handshake", {});
      }
    }, 60000);
    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);
  return (
    <ThemeProvider>
      <Layout />
    </ThemeProvider>
  );
};

export default App;
