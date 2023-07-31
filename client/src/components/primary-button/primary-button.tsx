import "./primary-button.scss";

interface PrimaryButtonProps {
  text: string;
  onChange: (event: any) => void;
}

const PrimaryButton = ({ text, onChange }: PrimaryButtonProps) => {
  return (
    <button className="primary-button" onClick={onChange}>
      {text}
    </button>
  );
};

export default PrimaryButton;
