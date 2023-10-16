import icon from "../../assets/images/icon-2.png";
import exit from "../../assets/images/exit-svg.svg";
import "./nav-bar.scss";
import { motion } from "framer-motion";

const NavBar = ({ exitRoomChange }: any) => {
  const scaleVariants = {
    initial: { scale: 1 },
    hover: { scale: 1.1 },
  };

  return (
    <ul className="nav-container">
      <li className="nav-links project">
        <img src={icon} alt="Icon" className="icon" />
        <h3 className="project-name">Code Share</h3>
      </li>
      <li className="nav-links exit-button">
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
