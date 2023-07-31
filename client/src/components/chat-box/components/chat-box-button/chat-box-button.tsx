import send from "../../../../assets/images/send.svg";
import "./chat-box-button.scss";
import { useSelector } from "react-redux/es/hooks/useSelector";
import { useDispatch } from "react-redux/es/exports";
import {
  updateChatMessages,
  updateMessage,
  updateEmitMessage,
} from "../../../../store/redux";

const ChatBoxButton = () => {
  const dispatch = useDispatch();

  const message = useSelector((state: any) => state.chatBox.message);
  const sendMessage = () => {
    dispatch(updateEmitMessage(true));
    dispatch(updateChatMessages({ type: "sent", message: message }));
  };
  return (
    <div className="chat-box-button-container">
      <img
        src={send}
        alt="Send"
        className="chat-box-button"
        onClick={sendMessage}
      ></img>
    </div>
  );
};

export default ChatBoxButton;
