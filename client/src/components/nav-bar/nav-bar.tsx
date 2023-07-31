import icon from "../../assets/images/icon-2.png";
import exit from "../../assets/images/exit-svg.svg";
import "./nav-bar.scss";

const NavBar = ({ exitRoomChange }: any) => {
  return (
    <ul className="nav-container">
      <li className="nav-links project">
        <img src={icon} alt="Icon" className="icon" />
        <h3 className="project-name">Code Share</h3>
      </li>
      <li className="nav-links exit-button">
        <img
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
