import "./text-area.scss";

interface TextAreaProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}
const TextArea = ({ value, onChange, onKeyDown }: TextAreaProps) => {
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
    <div className="editor">
      {value.length !== 0 && (
        <div className="line-numbers">{lineNumbersHTML}</div>
      )}
      <textarea
        className="text-area"
        value={value}
        onInput={onChange}
        onKeyDown={onKeyDown}
        placeholder="Type your text here..."
      ></textarea>
    </div>
  );
};

export default TextArea;
