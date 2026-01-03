import { useState, useEffect } from "react";
import TextArea from "../components/text-area/text-area";
import NavBar from "../components/nav-bar/nav-bar";
import JoinRoom from "../components/join-room/join-room";
import "./layout.scss";

import { useSelector, useDispatch } from "react-redux";
import { toggleJoinRoom } from "../store/store";
import { useAnimation, AnimatePresence } from "framer-motion";
import socket from "../utils/socket";
import { useInView } from "react-intersection-observer";
import JoinAlert from "../components/join-alert/join-alert";
import FileSender from "../components/file-sender/file-sender";
import FileReceiver from "../components/file-receiver/file-receiver";

const Layout = () => {
  const [newUser, setNewUser] = useState<string>("");

  const dispatch = useDispatch();
  const isJoined = useSelector((state: any) => state.joinRoom.isJoined);
  const room = useSelector((state: any) => state.joinRoom.room);
  const user = useSelector((state: any) => state.joinRoom.loggedInUser);

  console.log({ user });

  const { inView } = useInView();
  const animation = useAnimation();

  useEffect(() => {
    if (inView) {
      animation.start({
        x: 0,
        transition: {
          type: "spring",
          duration: 1,
        },
      });
      return;
    }
    animation.start({
      x: "-100vw",
    });
  }, [inView, animation]);

  useEffect(() => {
    if (!isJoined || !room) {
      return;
    }
    let clearNewUserTimeout: ReturnType<typeof setTimeout> | null = null;
    const handleJoinedRoom = (data: any) => {
      setNewUser(data);
      if (clearNewUserTimeout) {
        clearTimeout(clearNewUserTimeout);
      }
      clearNewUserTimeout = setTimeout(() => setNewUser(""), 3000);
    };

    socket.on("joined_room", handleJoinedRoom);

    return () => {
      if (clearNewUserTimeout) {
        clearTimeout(clearNewUserTimeout);
      }
      socket.off("joined_room", handleJoinedRoom);
    };
  }, [isJoined, room]);

  const exitRoomChange = () => {
    dispatch(toggleJoinRoom(false));
  };

  return (
    <div className="layout-container">
      <NavBar exitRoomChange={exitRoomChange}></NavBar>
      {newUser.length > 0 && <JoinAlert username={newUser}></JoinAlert>}
      <AnimatePresence initial={false}>
        {!isJoined && <JoinRoom></JoinRoom>}
      </AnimatePresence>

      {isJoined && <TextArea room={room} currentUser={user || "Anonymous"} />}
      {/*{isJoined && (
        <>
          <div className="file-sharing-container">
            <FileSender />
          </div>
          <div className="file-receiving-container">
            <FileReceiver />
          </div>
        </>
      )}*/}
    </div>
  );
};

export default Layout;
