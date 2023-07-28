import TextArea from "../components/text-area/text-area";
import PrimaryButton from "../components/primary-button/primary-button";
import "./layout.scss";

const Layout = () => {
  return (
    <div>
      <span className="hint">Hint: Alt+Enter to Send</span>
      <TextArea></TextArea>
      <PrimaryButton text="Send"></PrimaryButton>
    </div>
  );
};

export default Layout;
