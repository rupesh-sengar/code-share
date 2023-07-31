import "./join-room.scss";
import exit from "../../assets/images/exit-svg.svg";

interface JoinRoomProps {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRoomChange: () => void;
  onKeyDown: (event: any) => void;
}

const JoinRoom = ({ onChange, handleRoomChange, onKeyDown }: JoinRoomProps) => {
  return (
    <div className="join-room-container">
      <input
        type="text"
        className="join-room-input"
        placeholder="Enter Room ..."
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <button className="join-room-btn" onClick={handleRoomChange}>
        Join Room
      </button>
    </div>
  );
};

export default JoinRoom;
