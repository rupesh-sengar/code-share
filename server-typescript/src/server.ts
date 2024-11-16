import server from "./socket";

server.listen(3001, () => {
  console.log("listening on *:3001");
});
