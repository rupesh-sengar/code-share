import send from "../../../../assets/images/send.svg";
import "./chat-box-button.scss";
import { useSelector, useDispatch } from "react-redux";
import {
  updateChatMessages,
  updateMessage,
  updateEmitMessage,
} from "../../../../store/store";

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
