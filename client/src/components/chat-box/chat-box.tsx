import "./chat-box.scss";
import ChatBoxButton from "./components/chat-box-button/chat-box-button";
import ChatBoxInput from "./components/chat-box-input/chat-box-input";
import close from "../../assets/images/close.svg";
import chatboxlogo from "../../assets/images/chat-box-logo.svg";
import { ChatBoxMessages } from "../../utils/types";
import ChatBoxText from "./components/chat-box-text/chat-box-text";
import { useSelector, useDispatch } from "react-redux";
import { toggleChatOpen } from "../../store/store";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { useEffect } from "react";

const ChatBox = ({ animation }: any) => {
  const dispatch = useDispatch();
  const isChatOpen = useSelector((state: any) => state.chatBox.isChatOpen);
  const messages = useSelector((state: any) => state.chatBox.messages);

  const { ref, inView } = useInView();

  // useEffect(()=>{
  //   console.log("use effct hook, inView=", inView)
  // })
  const closeChatBox = () => {
    dispatch(toggleChatOpen());
  };

  const chatBoxVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 },
  };

  //console.log({ isChatOpen });
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, y: -50 }}
      variants={chatBoxVariants}
      transition={{ duration: 0.3 }}
      className="chat-box-container"
    >
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
    </motion.div>
  );
};

export default ChatBox;
