import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import LiveChatPanel from "../../components/live/LiveChatPanel";
import LiveStreamPlayer from "../../components/live/LiveStreamPlayer";
import { fetchLiveRoom, issueViewerToken } from "../../api/live.api";

export default function LiveWatch() {
  const { creatorId } = useParams();

  const roomRef = useRef(null);
  const mediaHostRef = useRef(null);
  const connectedRoomNameRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [streamState, setStreamState] = useState(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState("");

  const disconnectRoom = () => {
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }
    connectedRoomNameRef.current = "";
    if (mediaHostRef.current) {
      mediaHostRef.current.innerHTML = "";
    }
  };

  const connectViewer = async (roomName) => {
    if (!roomName) return;

    if (roomRef.current && connectedRoomNameRef.current === roomName) {
      return;
    }

    setConnecting(true);

    try {
      const tokenData = await issueViewerToken(Number(creatorId));
      const { Room, RoomEvent } = await import("livekit-client");

      disconnectRoom();

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.TrackSubscribed, (track) => {
        const element = track.attach();

        if (track.kind === "video") {
          element.style.width = "100%";
          element.style.height = "100%";
          element.style.objectFit = "cover";

          mediaHostRef.current.innerHTML = "";
          mediaHostRef.current.appendChild(element);
        }

        if (track.kind === "audio") {
          element.style.display = "none";
          mediaHostRef.current.appendChild(element);
        }
      });

      await room.connect(tokenData.url, tokenData.token);

      roomRef.current = room;
      connectedRoomNameRef.current = roomName;
    } catch (err) {
      console.error(err);
      setError("Failed to connect to live stream");
    } finally {
      setConnecting(false);
    }
  };

  const fetchViewers = async (room) => {
    try {
      const res = await fetch(`/live/viewers/${room}`);
      const data = await res.json();
      setViewerCount(data.count || 0);
    } catch {}
  };

  const load = async () => {
    try {
      const data = await fetchLiveRoom(creatorId);
      setStreamState(data);
      setError("");

      if (data?.mode === "live" && data?.room_name) {
        await connectViewer(data.room_name);
        fetchViewers(data.room_name);
        return;
      }

      disconnectRoom();

      if (data?.mode === "premiere" && data?.playUrl) {
        return;
      }

      setError("Creator is offline");
    } catch (err) {
      console.error(err);
      setError("Failed to load stream");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);

    return () => {
      clearInterval(timer);
      disconnectRoom();
    };
  }, [creatorId]);

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h4" fontWeight={800}>
          {streamState?.title || "Live room"}
        </Typography>

        {streamState?.mode === "live" && (
          <Typography color="error" fontWeight={700}>
            🔴 LIVE • {viewerCount} watching
          </Typography>
        )}

        {error && <Typography color="error">{error}</Typography>}

        <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
          <Box sx={{ flex: 1 }}>
            {streamState?.mode === "premiere" && streamState?.playUrl ? (
              <LiveStreamPlayer
                src={streamState.playUrl}
                initialOffsetSeconds={streamState.initialOffsetSeconds || 0}
              />
            ) : (
              <Box
                ref={mediaHostRef}
                sx={{
                  width: "100%",
                  height: 500,
                  background: "#000",
                  borderRadius: "12px",
                }}
              />
            )}
          </Box>

          <Box sx={{ width: 350 }}>
            <LiveChatPanel
              roomName={`creator:${creatorId}`}
              enabled={true}
            />
          </Box>
        </Stack>

        <Button variant="outlined" onClick={load}>
          Refresh
        </Button>
      </Stack>
    </Box>
  );
}