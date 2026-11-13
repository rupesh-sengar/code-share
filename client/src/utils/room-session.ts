import { z } from "zod";

export const roomSessionSchema = z.object({
  user: z.string().min(2, "Name must be at least 2 characters").max(20),
  room: z.string().min(3, "Room must be at least 3 characters"),
});

export type RoomSession = z.infer<typeof roomSessionSchema>;

export function getRoomSessionFromUrl(search = window.location.search): RoomSession | null {
  const params = new URLSearchParams(search);
  const result = roomSessionSchema.safeParse({
    user: params.get("name"),
    room: params.get("room"),
  });
  return result.success ? result.data : null;
}

export function setRoomSessionInUrl(session: RoomSession | null) {
  const url = new URL(window.location.href);
  if (session) {
    url.searchParams.set("name", session.user);
    url.searchParams.set("room", session.room);
  } else {
    url.searchParams.delete("name");
    url.searchParams.delete("room");
  }
  if (url.href !== window.location.href) {
    window.history.pushState(window.history.state, "", url);
  }
}
