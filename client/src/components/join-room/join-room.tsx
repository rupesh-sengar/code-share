import "./join-room.scss";
import { motion } from "framer-motion";
import { useDispatch } from "react-redux";
import {
  toggleJoinRoom,
  updateLoggedInUser,
  updateRoom,
} from "../../store/store";
import socket from "../../utils/socket";
import { z } from "zod";
import { useState } from "react";

const modalVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.8 },
};

const scaleVariants = {
  initial: { scale: 1 },
  hover: { scale: 1.1 },
};

const validationSchema = z.object({
  user: z.string().min(2, "Name must be at least 2 characters").max(20),
  room: z.string().min(3, "Room must be at least 3 characters"),
});

const JoinRoom = () => {
  // Variant for the modal animations
  const [isUserError, setIsUserError] = useState<string>("");
  const [isRoomError, setIsRoomError] = useState<string>("");
  const [room, setRoom] = useState<string>("");
  const [user, setUser] = useState<string>("");

  const dispatch = useDispatch();

  const onRoomInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsRoomError("");
    setRoom(event.target.value);
  };

  const onLoggedInUserInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setIsUserError("");
    setUser(event.target.value);
  };

  const joinRoom = () => {
    try {
      setIsUserError("");
      setIsRoomError("");

      const validationResult = validationSchema.safeParse({ user, room });
      if (!validationResult.success) {
        console.error("Join room validation failed:", {
          user,
          room,
          issues: validationResult.error.issues,
        });

        validationResult.error.issues.forEach((individualError) => {
          if (individualError.path[0] === "room")
            setIsRoomError(`*${individualError.message}`);
          if (individualError.path[0] === "user")
            setIsUserError(`*${individualError.message}`);
        });
        return;
      }

      socket.emit("join_room", { room, user });
      socket.emit("joined_user", { room, user });
      dispatch(updateRoom(room));
      dispatch(updateLoggedInUser(user));
      dispatch(toggleJoinRoom(true));
    } catch (error) {
      console.error("Join room failed unexpectedly:", error);
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
