import { useState, useEffect } from "react";
import socketio from "socket.io-client";
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
  updateChatMessages,
  updateEmitMessage,
  updateMessage,
} from "../store/redux";

const Layout = ({ randomNumber }: any) => {
  const [text, setText] = useState<string>("");
  const [room, setRoom] = useState<string>("default_room");
  const [isJoined, setIsJoined] = useState<boolean>(false);
  //const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

  const dispatch = useDispatch();
  const isChatOpen = useSelector((state: any) => state.chatBox.isChatOpen);
  const message = useSelector((state: any) => state.chatBox.message);
  const emitMessage = useSelector((state: any) => state.chatBox.emitMessage);

  //const socket = socketio("http://localhost:3001");

  const socket = socketio("https://code-share-backend.onrender.com/");
  useEffect(() => {
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
        // else
        //   dispatch(updateChatMessages({ type: "sent", message: data.message }));

        dispatch(updateMessage(""));
        dispatch(updateEmitMessage(false));
      } else {
        if (randomNumber !== data.id) setText(data.message);
      }
    });
  }, [socket, text, randomNumber, emitMessage, message]);

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

    // Now, update the state
    let message = event.target.value;
    setText(message);
    socket.emit("message", {
      room,
      message,
      id: randomNumber,
      type: "code",
    });
  };

  const handleRoomChangeOnEnter = (event: any) => {
    if (event.key === "Enter") {
      handleRoomChange();
    }
  };

  const handleRoomChange = () => {
    console.log({ room });
    setIsJoined(true);
    socket.emit("join_room", room);
  };

  const exitRoomChange = () => {
    setText("");
    setIsJoined(false);
  };

  return (
    <div className="layout-container">
      <NavBar exitRoomChange={exitRoomChange}></NavBar>
      {!isJoined && (
        <JoinRoom
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setRoom(event.target.value)
          }
          handleRoomChange={handleRoomChange}
          onKeyDown={handleRoomChangeOnEnter}
        ></JoinRoom>
      )}
      {isJoined ? (
        isChatOpen ? (
          <ChatBox></ChatBox>
        ) : (
          <img
            src={messagesvg}
            alt="message-svg"
            className="message-svg"
            onClick={() => dispatch(toggleChatOpen())}
          />
        )
      ) : null}
      <TextArea
        value={text}
        onChange={handleTextAreaChange}
        onKeyDown={handleKeyDown}
      ></TextArea>
    </div>
  );
};

export default Layout;
