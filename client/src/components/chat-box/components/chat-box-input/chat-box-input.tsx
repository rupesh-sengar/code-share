import { updateChatMessages, updateMessage } from "../../../../store/redux";
import "./chat-box-input.scss";
import { useDispatch, useSelector } from "react-redux";
const ChatBoxInput = () => {
  const dispatch = useDispatch();
  const message = useSelector((state: any) => state.chatBox.message);

  const handleMessageChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const chatMessage = event?.target.value;
    dispatch(updateMessage(chatMessage));
  };

  const sendMessage = (event: any) => {
    if (event.key === "Enter") {
      dispatch(updateChatMessages({ type: "sent", message: message }));
    }
  };

  return (
    <div className="chat-box-input-container">
      <textarea
        value={message}
        placeholder="Send Message ..."
        className="chat-box-text-area"
        onChange={handleMessageChange}
        // onKeyDown={sendMessage}
      ></textarea>
    </div>
  );
};

export default ChatBoxInput;
