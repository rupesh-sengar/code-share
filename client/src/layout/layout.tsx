import { useState, useEffect, useRef } from "react";
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

type ServerConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

const Layout = () => {
  const [newUser, setNewUser] = useState<string>("");
  const [serverStatus, setServerStatus] = useState<ServerConnectionStatus>(
    socket.connected ? "connected" : "connecting",
  );
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const dispatch = useDispatch();
  const isJoined = useSelector((state: any) => state.joinRoom.isJoined);
  const room = useSelector((state: any) => state.joinRoom.room);
  const user = useSelector((state: any) => state.joinRoom.loggedInUser);
  const activeSessionRef = useRef({
    isJoined: false,
    room: "",
    user: "",
  });

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
    activeSessionRef.current = {
      isJoined,
      room,
      user,
    };
  }, [isJoined, room, user]);

  useEffect(() => {
    const rejoinRoomIfNeeded = () => {
      const {
        isJoined: joinedRoom,
        room: activeRoom,
        user: activeUser,
      } = activeSessionRef.current;

      if (!joinedRoom || !activeRoom || !activeUser) {
        return;
      }

      socket.emit("join_room", { room: activeRoom, user: activeUser });
      socket.emit("joined_user", { room: activeRoom, user: activeUser });
    };

    const handleConnect = () => {
      setServerStatus("connected");
      setReconnectAttempts(0);
      rejoinRoomIfNeeded();
    };

    const handleDisconnect = () => {
      setServerStatus("disconnected");
    };

    const handleConnectError = () => {
      setServerStatus("reconnecting");
    };

    const handleReconnectAttempt = (attempt: number) => {
      setServerStatus("reconnecting");
      setReconnectAttempts(attempt);
    };

    const handleReconnectFailed = () => {
      setServerStatus("disconnected");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);
    socket.io.on("reconnect_failed", handleReconnectFailed);

    if (socket.connected) {
      setServerStatus("connected");
    } else {
      setServerStatus("connecting");
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      socket.io.off("reconnect_failed", handleReconnectFailed);
    };
  }, []);

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
      <NavBar
        exitRoomChange={exitRoomChange}
        serverStatus={serverStatus}
        reconnectAttempts={reconnectAttempts}
      ></NavBar>
      {newUser.length > 0 && <JoinAlert username={newUser}></JoinAlert>}
      <AnimatePresence initial={false}>
        {!isJoined && <JoinRoom></JoinRoom>}
      </AnimatePresence>
      {isJoined && (
        <>
          <TextArea room={room} currentUser={user || "Anonymous"} />
          <div className="file-sharing-container">
            <FileSender />
          </div>
          <div className="file-receiving-container">
            <FileReceiver />
          </div>
        </>
      )}
    </div>
  );
};

export default Layout;
