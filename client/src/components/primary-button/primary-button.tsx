import "./primary-button.scss";

interface PrimaryButtonProps {
  text: string;
}

const PrimaryButton = ({ text }: PrimaryButtonProps) => {
  return <button className="primary-button">{text}</button>;
};

export default PrimaryButton;
