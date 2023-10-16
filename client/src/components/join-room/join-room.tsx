import "./join-room.scss";
import { motion } from "framer-motion";
import { useSelector, useDispatch } from "react-redux";
import {
  toggleJoinRoom,
  updateLoggedInUser,
  updateRoom,
} from "../../store/store";
import socket from "../../utils/socket";
import { z } from "zod";
import { useState, useEffect } from "react";

interface JoinRoomProps {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: any) => void;
}

const modalVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

const scaleVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.1 },
};

const schema = z.object({
  username: z.string().min(1),
  room: z.string().min(1),
});

const JoinRoom = () => {
  // Variant for the modal animations
  const [isUserError, setIsUserError] = useState<string>("");
  const [isRoomError, setIsRoomError] = useState<string>("");
  const [room, setRoom] = useState<string>("");
  const [user, setUser] = useState<string>("");

  const dispatch = useDispatch();

  // useEffect(() => {
  //   socket.on("joined_room", (data) => {
  //     console.log("joined room data: ", data);
  //   });
  // });

  const onRoomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsRoomError("");
    setRoom(event.target.value);
  };

  const onLoggedInUserInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setIsUserError("");
    setUser(event.target.value);
  };

  const joinRoom = () => {
    const userInput = {
      username: user,
      room: room,
    };

    try {
      const validatedData = schema.parse(userInput);
      socket.emit("join_room", { room, user });
      socket.emit("joined_user", { room, user });
      dispatch(updateRoom(room));
      dispatch(updateLoggedInUser(user));
      dispatch(toggleJoinRoom(true));
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.message);
        error.errors.forEach((individualError) => {
          if (individualError.path[0] === "room")
            setIsRoomError("*Room is required");
          else setIsUserError("*Name is required");
        });
      } else {
        console.error("An unexpected error occurred:", error);
      }
    }
  };

  const handleRoomChange = () => {
    joinRoom();
  };

  const handleKeyDownChange = (event: any) => {
    if (event.key === "Enter") joinRoom();
  };
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.3 }}
      variants={modalVariants}
      transition={{ duration: 0.2 }}
      className="join-room-container"
    >
      {isUserError.length > 0 && <p className="error">{isUserError}</p>}
      <input
        type="text"
        className="join-room-input"
        placeholder="Enter Name ..."
        onChange={onLoggedInUserInputChange}
        onKeyDown={handleKeyDownChange}
      />
      {isRoomError.length > 0 && <p className="error">{isRoomError}</p>}
      <input
        type="text"
        className="join-room-input"
        placeholder="Enter Room ..."
        onChange={onRoomInputChange}
        onKeyDown={handleKeyDownChange}
      />

      <motion.button
        initial="initial"
        whileHover="hover"
        variants={scaleVariants}
        transition={{ duration: 0.1 }}
        className="join-room-btn"
        onClick={handleRoomChange}
      >
        Join Room
      </motion.button>
    </motion.div>
  );
};

export default JoinRoom;
