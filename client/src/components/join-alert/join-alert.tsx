import "./join-alert.scss";
import { useSelector } from "react-redux";
import { motion } from "framer-motion";
import { useEffect } from "react";
import notification from "../../assets/sounds/notification.mp3";

const chatBoxVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 50 },
};

interface JoinAlertProps {
  username: string;
}

const JoinAlert = ({ username }: JoinAlertProps) => {
  const user = useSelector((state: any) => state.joinRoom.loggedInUser);
  //const [sound] = useSound("../../assets/sounds/notification.mp3");
  useEffect(() => {
    const audio = new Audio(notification);
    audio.play();
    // Clean up the audio when the component unmounts
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
    // const targetAudio = document.getElementsByClassName("audioSource")[0];
    // targetAudio.play();
  }, []);

  //console.log("user: ", user);
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={chatBoxVariants}
      transition={{ duration: 0.3 }}
      className="join-alert"
    >
      <div className="join-alert__content">
        <div className="join-alert__content__desc">
          <p>
            <span className="join-alert__content__username">{username}</span>{" "}
            joined!
          </p>
        </div>
      </div>
      <audio className="audioSource">
        <source
          type="audio/mp3"
          src="../../assets/sounds/notification.mp3"
        ></source>
      </audio>
    </motion.div>
  );
};

export default JoinAlert;
