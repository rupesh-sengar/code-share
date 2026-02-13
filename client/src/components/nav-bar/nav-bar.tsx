import icon from "../../assets/images/icon-2.png";
import exit from "../../assets/images/exit-svg.svg";
import "./nav-bar.scss";
import { motion } from "framer-motion";

type ServerConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

interface NavBarProps {
  exitRoomChange: () => void;
  reconnectAttempts: number;
  serverStatus: ServerConnectionStatus;
}

const NavBar = ({
  exitRoomChange,
  reconnectAttempts,
  serverStatus,
}: NavBarProps) => {
  const scaleVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.1 },
  };

  const getServerStatusLabel = () => {
    if (serverStatus === "connected") return "Connected";
    if (serverStatus === "connecting") return "Connecting";
    if (serverStatus === "reconnecting") {
      return reconnectAttempts > 0
        ? `Reconnecting (${reconnectAttempts})`
        : "Reconnecting";
    }
    return "Disconnected";
  };

  return (
    <ul className="nav-container">
      <li className="nav-links project">
        <img src={icon} alt="Icon" className="icon" />
        <h3 className="project-name">Code Share</h3>
        {/*<div className="nav-links language">
          <select
            className="project-name language-select"
            name="languages"
            id="languages"
            title="Select Language"
            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
              dispatch(updateLanguage(event.target.value));
            }}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
          </select>
        </div>*/}
      </li>
      <li className="nav-links nav-actions">
        <div className={`server-status server-status-${serverStatus}`}>
          <span className="server-status-dot"></span>
          <span className="server-status-text">{getServerStatusLabel()}</span>
        </div>
        <motion.img
          initial="initial"
          whileHover="hover"
          variants={scaleVariants}
          transition={{ duration: 0.2 }}
          src={exit}
          alt="Exit"
          className="exit-svg"
          onClick={exitRoomChange}
        />
      </li>
    </ul>
  );
};

export default NavBar;
