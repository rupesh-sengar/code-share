import "./chat-box-text.scss";
import { useRef, useEffect } from "react";
interface ChatBoxTextProps {
  type: string;
  message: string;
}

const ChatBoxText = ({ type, message }: ChatBoxTextProps) => {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const divNode = divRef.current;
    if (divNode) {
      divNode.scrollIntoView({ behavior: "smooth" });
    }
  }, [divRef]);
  return (
    <div
      className={`chat-box-text-container ${
        type === "sent" ? "sent" : "received"
      }`}
      ref={divRef}
    >
      <span
        className={`chat-box-text ${type === "sent" ? "sent" : "received"}`}
      >
        {message}
      </span>
    </div>
  );
};

export default ChatBoxText;
