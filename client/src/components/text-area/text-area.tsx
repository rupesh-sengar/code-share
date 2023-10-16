import "./text-area.scss";
import { useState, useEffect } from "react";
import socket from "../../utils/socket";
import { useSelector } from "react-redux/es/hooks/useSelector";
import JoinAlert from "../join-alert/join-alert";

interface TextAreaProps {
  value: string;
  isTyping: boolean;
  cursorPosition: { x: number; y: number; newCols: number };
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLTextAreaElement>) => void;
}
const TextArea = ({
  value,
  onChange,
  onKeyDown,
  cursorPosition,
  onBlur,
}: TextAreaProps) => {
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const room = useSelector((state: any) => state.joinRoom.room);
  useEffect(() => {
    socket.on("typing", (data) => {
      setIsTyping(data.isRemoteTyping);
    });
  }, []);

  // Function to calculate the number of lines in the textarea
  const getLineCount = () => {
    return value.split("\n").length;
  };

  // Generate line numbers HTML
  const lineNumbersHTML = Array.from({ length: getLineCount() }).map(
    (_, index) => (
      <div className="line-element" key={index + 1}>
        {index + 1}
      </div>
    )
  );

  return (
    <div id="editor" className="editor">
      {value.length !== 0 && (
        <div className="line-numbers">{lineNumbersHTML}</div>
      )}

      <textarea
        rows={500}
        cols={cursorPosition.newCols}
        className="text-area"
        value={value}
        onChange={onChange}
        onInput={onChange}
        onKeyDown={onKeyDown}
        placeholder="Type your text here..."
        onBlur={onBlur}
      ></textarea>
      {/* {isTyping && (
        <div
          className="tooltip"
          style={{
            position: "absolute",
            top: cursorPosition.y - 25 + "px",
            left: cursorPosition.x + "px",
          }}
        >
          Tooltip Text
        </div>
      )} */}
    </div>
  );
};

export default TextArea;
