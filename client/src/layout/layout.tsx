import { useState, useEffect } from "react";
import TextArea from "../components/text-area/text-area";
import NavBar from "../components/nav-bar/nav-bar";
import JoinRoom from "../components/join-room/join-room";
import "./layout.scss";

import { useSelector, useDispatch } from "react-redux";
import {
  toggleJoinRoom,
  updateChatMessages,
  updateEmitMessage,
  updateMessage,
} from "../store/store";
import { useAnimation, AnimatePresence } from "framer-motion";
import socket from "../utils/socket";
import { useInView } from "react-intersection-observer";
import JoinAlert from "../components/join-alert/join-alert";
import FileSender from "../components/file-sender/file-sender";
import FileReceiver from "../components/file-receiver/file-receiver";

const Layout = ({ randomNumber }: any) => {
  const [text, setText] = useState<string>("");
  const [isTyping, setIsTyping] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({
    x: 0,
    y: 0,
    newCols: 40,
  });
  const [newUser, setNewUser] = useState<string>("");

  const dispatch = useDispatch();
  const message = useSelector((state: any) => state.chatBox.message);
  const emitMessage = useSelector((state: any) => state.chatBox.emitMessage);
  const isJoined = useSelector((state: any) => state.joinRoom.isJoined);
  console.log("🚀 ~ Layout ~ isJoined:", isJoined);
  const room = useSelector((state: any) => state.joinRoom.room);

  const { ref, inView } = useInView();
  const animation = useAnimation();

  useEffect(() => {
    if (inView) {
      animation.start({
        x: 0,
        transition: {
          type: "spring",
          duration: 1,
        },
      });
    }
    if (!inView) {
      animation.start({
        x: "-100vw",
      });
    }
    if (emitMessage) {
      socket.emit("message", {
        room,
        message,
        id: randomNumber,
        type: "chat",
      });
    }
    socket.on("receive_msg", (data) => {
      if (data.type === "chat") {
        if (randomNumber !== data.id)
          dispatch(
            updateChatMessages({ type: "received", message: data.message })
          );

        dispatch(updateMessage(""));
        dispatch(updateEmitMessage(false));
      } else {
        if (randomNumber !== data.id) {
          setIsTyping(true);
          setText(data.message);
        }
      }
    });
    socket.on("joined_room", (data) => {
      setNewUser(data);
      setTimeout(() => setNewUser(""), 3000);
    });
  }, [
    text,
    randomNumber,
    emitMessage,
    message,
    inView,
    room,
    animation,
    dispatch,
  ]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      console.log("Enter key pressed!");
    }
  };

  const handleTextAreaChange = (event: any): void => {
    let message = event;
    setText(message);
    socket.emit("typing", { room, isRemoteTyping: true });
    socket.emit("message", {
      room,
      message,
      id: randomNumber,
      type: "code",
    });
  };

  const exitRoomChange = () => {
    setText("");
    dispatch(toggleJoinRoom(false));
  };

  const handleStopTyping = () => {
    socket.emit("typing", { room, isRemoteTyping: false });
  };

  return (
    <div className="layout-container">
      <NavBar exitRoomChange={exitRoomChange}></NavBar>
      {newUser.length > 0 && <JoinAlert username={newUser}></JoinAlert>}
      <AnimatePresence initial={false}>
        {!isJoined && <JoinRoom></JoinRoom>}
      </AnimatePresence>

      <TextArea
        value={text}
        cursorPosition={cursorPosition}
        onChange={handleTextAreaChange}
        onKeyDown={handleKeyDown}
        onBlur={handleStopTyping}
      ></TextArea>
      {isJoined && (
        <div className="file-sharing-container">
          <FileSender />
          <FileReceiver />
        </div>
      )}
    </div>
  );
};

export default Layout;
