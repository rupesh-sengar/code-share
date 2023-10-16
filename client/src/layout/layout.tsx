import { useState, useEffect } from "react";
import { VhToPx } from "../utils/helper-functions";

// Components and CSS Imports
import TextArea from "../components/text-area/text-area";
import NavBar from "../components/nav-bar/nav-bar";
import JoinRoom from "../components/join-room/join-room";
import "./layout.scss";
import ChatBox from "../components/chat-box/chat-box";
import messagesvg from "../assets/images/message.svg";

import { useSelector, useDispatch } from "react-redux";
import {
  toggleChatOpen,
  toggleJoinRoom,
  updateChatMessages,
  updateEmitMessage,
  updateMessage,
} from "../store/store";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import socket from "../utils/socket";
import { useInView } from "react-intersection-observer";
import JoinAlert from "../components/join-alert/join-alert";

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
  const isChatOpen = useSelector((state: any) => state.chatBox.isChatOpen);
  const message = useSelector((state: any) => state.chatBox.message);
  const emitMessage = useSelector((state: any) => state.chatBox.emitMessage);
  const isJoined = useSelector((state: any) => state.joinRoom.isJoined);
  const room = useSelector((state: any) => state.joinRoom.room);

  const { ref, inView } = useInView();
  const animation = useAnimation();

  //const socket = socketio("https://code-share-backend.onrender.com/");
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

  const handleTextAreaChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ): void => {
    const scrollHeight = event.target.scrollHeight;
    if (scrollHeight > VhToPx(100)) {
      // * This code prevents Text Area to use internal scrollbar
      event.target.style.height = "auto"; // Reset the height to calculate the new height
      event.target.style.height = `${scrollHeight}px`;
    }

    const editorContainer = document.getElementById("editor");
    let newCols = 40;
    if (editorContainer) {
      const containerWidth = editorContainer.clientWidth; // Assuming you have a container for the textarea
      const charWidth = 8; // Approximate width of a character
      newCols = Math.floor(containerWidth / charWidth);
    }

    const textarea = event.target;
    const selectionStart = textarea.selectionStart;
    const { top, left } = textarea.getBoundingClientRect();

    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
    const lines = textarea.value.substr(0, selectionStart).split("\n");
    const lineIndex = lines.length - 1;

    const x = left + (selectionStart % textarea.cols) * 8; // Assuming 8px per character width
    const y = top + lineIndex * lineHeight;

    setCursorPosition({ x, y, newCols });

    // Now, update the state
    let message = event.target.value;
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
    // setText(
    //   text.replace(
    //     /((https?|ftp):\/\/[^\s/$.?#].[^\s]*)/g,
    //     '<a href="$1" target="_blank">$1</a>'
    //   )
    // );
  };

  const scaleVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.1 },
  };

  return (
    <div className="layout-container">
      <NavBar exitRoomChange={exitRoomChange}></NavBar>
      {newUser.length > 0 && <JoinAlert username={newUser}></JoinAlert>}
      <AnimatePresence initial={false}>
        {!isJoined && <JoinRoom></JoinRoom>}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isJoined ? (
          isChatOpen ? (
            <ChatBox animation={animation}></ChatBox>
          ) : (
            <motion.img
              initial="initial"
              whileHover="hover"
              variants={scaleVariants}
              transition={{ duration: 0.2 }}
              src={messagesvg}
              alt="message-svg"
              className="message-svg"
              onClick={() => dispatch(toggleChatOpen())}
            />
          )
        ) : null}
      </AnimatePresence>

      <TextArea
        value={text}
        isTyping={isTyping}
        cursorPosition={cursorPosition}
        onChange={handleTextAreaChange}
        onKeyDown={handleKeyDown}
        onBlur={handleStopTyping}
      ></TextArea>
    </div>
  );
};

export default Layout;
