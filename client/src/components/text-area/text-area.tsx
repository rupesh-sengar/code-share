import "./text-area.scss";
import { Editor } from "@monaco-editor/react";

interface TextAreaProps {
  value: string;
  cursorPosition: { x: number; y: number; newCols: number };
  onChange: (event: any) => void;
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
  return (
    <div id="editor" className="editor">
      <Editor
        height="100vh"
        defaultLanguage="javascript"
        defaultPath="index.js"
        theme="vs-dark"
        onChange={onChange}
        value={value}
      />
    </div>
  );
};

export default TextArea;
