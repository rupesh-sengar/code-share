import ThemeProvider from "./components/theme-provider/theme-provider";
import "./App.scss";
import Layout from "./layout/layout";
import socket from "./utils/socket";
import { useEffect } from "react";

const App = () => {
  const randomNumber = Math.random();

  useEffect(() => {
    const interval = setInterval(() => {
      socket.emit("handshake", {});
    }, 60000);
    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);
  return (
    <ThemeProvider>
      <Layout randomNumber={randomNumber}></Layout>
    </ThemeProvider>
  );
};

export default App;
