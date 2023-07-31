import "./chat-box.scss";
import ChatBoxButton from "./components/chat-box-button/chat-box-button";
import ChatBoxInput from "./components/chat-box-input/chat-box-input";
import close from "../../assets/images/close.svg";
import chatboxlogo from "../../assets/images/chat-box-logo.svg";
import { ChatBoxMessages } from "../../utils/types";
import ChatBoxText from "./components/chat-box-text/chat-box-text";
import { useSelector, useDispatch } from "react-redux";
import { toggleChatOpen } from "../../store/redux";
import { useRef, useEffect } from "react";

interface ChatBoxProps {
  messages: ChatBoxMessages[];
}

interface ChatBoxStateProps {
  isChatOpen: boolean;
  messages: ChatBoxMessages[];
}

const ChatBox = () => {
  const dispatch = useDispatch();
  const isChatOpen = useSelector((state: any) => state.chatBox.isChatOpen);
  const messages = useSelector((state: any) => state.chatBox.messages);

  const closeChatBox = () => {
    dispatch(toggleChatOpen());
  };

  console.log({ isChatOpen });
  return (
    <div className="chat-box-container">
      <div className="chat-box-header">
        <img src={chatboxlogo} alt="" className="chat-box-logo" />
        <img
          src={close}
          alt=""
          className="close-button"
          onClick={closeChatBox}
        />
      </div>
      <div className="chat-box-text-area-container">
        {messages.map((message: ChatBoxMessages) => (
          <ChatBoxText
            key={Math.random()}
            type={message.type}
            message={message.message}
          ></ChatBoxText>
        ))}
      </div>
      <div className="chat-box-input">
        <ChatBoxInput></ChatBoxInput>
        <ChatBoxButton></ChatBoxButton>
      </div>
    </div>
  );
};

export default ChatBox;
