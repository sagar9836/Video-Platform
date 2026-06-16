import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import CameraswitchIcon from "@mui/icons-material/Cameraswitch";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import VideocamIcon from "@mui/icons-material/Videocam";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import {
  endLiveSession,
  fetchMyLiveSession,
  issuePublisherToken,
  startLiveRecording,
  startLiveSession,
} from "../../api/live.api";
import { useAuth } from "../../auth/AuthContext";
import LiveChatPanel from "../../components/live/LiveChatPanel";

const LIVEKIT_CONNECT_OPTIONS = {
  maxRetries: 3,
  peerConnectionTimeout: 25000,
  websocketTimeout: 25000,
};
const MAX_PUBLISHER_RECOVERY_ATTEMPTS = 5;

export default function LiveControl() {
  const { user } = useAuth();

  const roomRef = useRef(null);
  const localTracksRef = useRef([]);
  const previewHostRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const stopRequestedRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [session, setSession] = useState(null);
  const [title, setTitle] = useState(`${user?.creator?.channel_name || "Creator"} live`);
  const [description, setDescription] = useState("");
  const [previewReady, setPreviewReady] = useState(false);

  const liveRoomUrl = useMemo(() => {
    const creatorId = user?.creator?.id;
    return creatorId ? `${window.location.origin}/live/${creatorId}` : "";
  }, [user?.creator?.id]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const data = await fetchMyLiveSession();
        if (!mounted) {
          return;
        }
        if (data?.session) {
          setSession(data.session);
          setTitle(data.session.title || `${user?.creator?.channel_name || "Creator"} live`);
          setDescription(data.session.description || "");
        }
      } catch (err) {
        if (mounted) {
          setError(err?.response?.data?.detail || "Unable to load live studio.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      cleanupRoom();
    };
  }, []);

  const disconnectRoom = () => {
    if (roomRef.current) {
      const activeRoom = roomRef.current;
      roomRef.current = null;
      activeRoom.disconnect();
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const stopLocalPreview = () => {
    localTracksRef.current.forEach((track) => {
      try {
        track.detach().forEach((element) => element.remove());
      } catch {
        // Ignore detach failures during teardown.
      }
      track.stop();
    });
    localTracksRef.current = [];

    if (previewHostRef.current) {
      previewHostRef.current.innerHTML = "";
    }
    setPreviewReady(false);
  };

  const cleanupRoom = () => {
    clearReconnectTimer();
    disconnectRoom();
    stopLocalPreview();
  };

  const ensureLocalPreview = async () => {
    if (localTracksRef.current.length > 0) {
      return localTracksRef.current;
    }

    setPreparing(true);
    setError("");

    try {
      const { createLocalTracks, Track, VideoPresets } = await import("livekit-client");
      const tracks = await createLocalTracks({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: {
          resolution: VideoPresets.h720.resolution,
        },
      });

      localTracksRef.current = tracks;

      const videoTrack = tracks.find((track) => track.kind === Track.Kind.Video);
      if (videoTrack && previewHostRef.current) {
        previewHostRef.current.innerHTML = "";
        const element = videoTrack.attach();
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.objectFit = "cover";
        element.style.borderRadius = "24px";
        previewHostRef.current.appendChild(element);
      }

      setPreviewReady(true);
      setNotice("Camera and microphone are ready.");
      return tracks;
    } catch (err) {
      setError(
        err?.message ||
          "The browser could not access your camera and microphone."
      );
      throw err;
    } finally {
      setPreparing(false);
    }
  };

  const copyValue = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(label);
      setTimeout(() => setCopyState(""), 1500);
    } catch {
      setError(`Unable to copy ${label}.`);
    }
  };

  const connectPublisherRoom = async (tracks, payload) => {
    const { Room, RoomEvent, VideoPresets } = await import("livekit-client");
    const tokenData = await issuePublisherToken();

    disconnectRoom();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      publishDefaults: {
        simulcast: true,
        dtx: true,
        red: true,
        stopMicTrackOnMute: false,
        videoCodec: "vp8",
        backupCodec: true,
      },
    });

    room.on(RoomEvent.Reconnecting, () => {
      setNotice("Connection is unstable. Reconnecting to the live room...");
    });

    room.on(RoomEvent.Reconnected, () => {
      reconnectAttemptsRef.current = 0;
      setNotice("Live room reconnected.");
    });

    room.on(RoomEvent.Disconnected, () => {
      if (roomRef.current !== room) {
        return;
      }

      roomRef.current = null;
      if (stopRequestedRef.current) {
        return;
      }

      setSession((prev) => (prev ? { ...prev, status: "STARTING" } : prev));
      setError("");
      const nextAttempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = nextAttempt;

      if (nextAttempt > MAX_PUBLISHER_RECOVERY_ATTEMPTS) {
        setError("The live room dropped and automatic recovery could not reconnect. Your preview is still ready.");
        return;
      }

      const delay = Math.min(2000 * nextAttempt, 10000);
      setNotice(`Live room disconnected. Retrying connection in ${Math.round(delay / 1000)}s...`);
      clearReconnectTimer();
      reconnectTimeoutRef.current = setTimeout(async () => {
        try {
          await connectPublisherRoom(localTracksRef.current, payload);
          setSession((prev) => (prev ? { ...prev, status: "LIVE" } : prev));
          setNotice("Live room recovered.");
        } catch (err) {
          setError(
            err?.response?.data?.detail ||
              err?.message ||
              "Unable to recover the live room automatically."
          );
        }
      }, delay);
    });

    room.prepareConnection(tokenData.url, tokenData.token);
    await room.connect(tokenData.url, tokenData.token, LIVEKIT_CONNECT_OPTIONS);

    for (const track of tracks) {
      await room.localParticipant.publishTrack(track);
    }

    roomRef.current = room;
    reconnectAttemptsRef.current = 0;
    return tokenData;
  };

const goLive = async () => {
  setPublishing(true);
  setError("");
  setNotice("");
  stopRequestedRef.current = false;

  try {
    const payload = {
      title: title.trim(),
      description,
      recording_enabled: true,
    };

    const sessionData = await startLiveSession(payload);
    if (sessionData?.session) {
      setSession(sessionData.session);
    }

    const tracks = await ensureLocalPreview();
    await connectPublisherRoom(tracks, payload);

    try {
      const recordingData = await startLiveRecording();
      setSession(recordingData.session || sessionData.session);
      setNotice("You are live and recording.");
    } catch (recordingErr) {
      setSession(sessionData.session ? { ...sessionData.session, status: "LIVE" } : null);
      setNotice("You are live, but recording could not be started.");
      setError(
        recordingErr?.response?.data?.detail ||
          recordingErr?.message ||
          "Recording could not be started."
      );
    }
  } catch (err) {
    setError(err?.response?.data?.detail || err?.message || "Failed to start live");
  } finally {
    setPublishing(false);
  }
};

  const stopLive = async () => {
    setEnding(true);
    setError("");
    stopRequestedRef.current = true;
    clearReconnectTimer();

    try {
      await endLiveSession();
      cleanupRoom();
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "ENDED",
            }
          : null
      );
      setNotice("The live session has ended.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to end the live session.");
    } finally {
      setEnding(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isLive = session?.status === "LIVE";

  return (
    <Box sx={{ maxWidth: 1280, mx: "auto", mt: 4, px: { xs: 2, md: 3 }, pb: 6 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: "column", xl: "row" }} spacing={3}>
        <Card
          sx={{
            flex: 1.2,
            borderRadius: 5,
            overflow: "hidden",
            background:
              "linear-gradient(140deg, rgba(10,10,10,0.98), rgba(39,9,15,0.96) 55%, rgba(120,14,24,0.92))",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  icon={<LiveTvIcon sx={{ color: "inherit !important" }} />}
                  label={isLive ? "Live now" : "WebRTC Studio"}
                  sx={{
                    bgcolor: isLive ? "#ff0033" : "rgba(255,255,255,0.12)",
                    color: "#fff",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  label={session?.room_name || `creator-${user?.creator?.id || "room"}`}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                />
              </Stack>

              <Typography variant="h3" fontWeight={900} sx={{ letterSpacing: "-0.04em" }}>
                Go live directly from your browser.
              </Typography>

              <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 700 }}>
                This studio is built around WebRTC, so you can preview locally, publish
                faster, and send viewers into one stable live room directly from the browser.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ borderRadius: 3 }}>
                  {error}
                </Alert>
              )}

              {notice && (
                <Alert severity="success" sx={{ borderRadius: 3 }}>
                  {notice}
                </Alert>
              )}

              <Box
                sx={{
                  position: "relative",
                  minHeight: { xs: 260, md: 420 },
                  borderRadius: 4,
                  overflow: "hidden",
                  bgcolor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Box
                  ref={previewHostRef}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    display: previewReady ? "block" : "none",
                  }}
                />
                {!previewReady && (
                  <Stack
                    sx={{
                      position: "absolute",
                      inset: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      px: 3,
                    }}
                    spacing={2}
                  >
                    <VideocamIcon sx={{ fontSize: 52, opacity: 0.8 }} />
                    <Typography variant="h5" fontWeight={800}>
                      Camera preview will appear here
                    </Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.68)", maxWidth: 560 }}>
                      Start a local preview first so the browser can lock in your camera
                      and microphone before you publish the room.
                    </Typography>
                  </Stack>
                )}
              </Box>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="outlined"
                  startIcon={<CameraswitchIcon />}
                  onClick={ensureLocalPreview}
                  disabled={preparing || previewReady}
                  sx={{
                    borderRadius: 999,
                    color: "#fff",
                    borderColor: "rgba(255,255,255,0.24)",
                  }}
                >
                  {preparing ? "Preparing..." : previewReady ? "Preview ready" : "Start preview"}
                </Button>

                <Button
                  variant="contained"
                  startIcon={<LiveTvIcon />}
                  onClick={goLive}
                  disabled={publishing || isLive}
                  sx={{ borderRadius: 999, bgcolor: "#ff0033", "&:hover": { bgcolor: "#dc002c" } }}
                >
                  {publishing ? "Going live..." : isLive ? "Live now" : "Go live"}
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<StopCircleIcon />}
                  onClick={stopLive}
                  disabled={ending || !isLive}
                  sx={{
                    borderRadius: 999,
                    color: "#fff",
                    borderColor: "rgba(255,255,255,0.24)",
                  }}
                >
                  {ending ? "Ending..." : "End live"}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card
          sx={{
            flex: 0.85,
            borderRadius: 5,
            bgcolor: "#101010",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2.5}>
              <Typography variant="h5" fontWeight={800}>
                Stream details
              </Typography>

              <TextField
                label="Live title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    color: "#fff",
                    borderRadius: 3,
                  },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.65)" },
                }}
              />

              <TextField
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                fullWidth
                multiline
                minRows={4}
                InputLabelProps={{ shrink: true }}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    color: "#fff",
                    borderRadius: 3,
                  },
                  "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.65)" },
                }}
              />

              <Box
                sx={{
                  p: 2,
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Typography sx={{ color: "rgba(255,255,255,0.58)", fontSize: 13 }}>
                  Public live room
                </Typography>
                <Typography sx={{ mt: 0.8, wordBreak: "break-all", fontWeight: 700 }}>
                  {liveRoomUrl || "Unavailable"}
                </Typography>
                {liveRoomUrl && (
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copyValue("live-room", liveRoomUrl)}
                    sx={{ mt: 1, px: 0, color: copyState === "live-room" ? "#ff9aa7" : "#fff" }}
                  >
                    {copyState === "live-room" ? "Copied" : "Copy room link"}
                  </Button>
                )}
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Typography sx={{ color: "rgba(255,255,255,0.58)", fontSize: 13 }}>
                  Session status
                </Typography>
                <Typography sx={{ mt: 0.8, fontWeight: 700 }}>
                  {session?.status || "Not created yet"}
                </Typography>
                <Typography sx={{ mt: 1, color: "rgba(255,255,255,0.68)" }}>
                  Room: {session?.room_name || `creator-${user?.creator?.id || "room"}`}
                </Typography>
              </Box>

              <Stack spacing={1.2}>
                <Typography fontWeight={800}>Publishing flow</Typography>
                {[
                  "Start the local preview once so the browser gets camera and microphone access.",
                  "Click Go live to create or update the session, request a publisher token, and connect to the LiveKit room.",
                  "Open the public room link in another tab to verify viewer playback.",
                ].map((item) => (
                  <Typography key={item} sx={{ color: "rgba(255,255,255,0.72)" }}>
                    {item}
                  </Typography>
                ))}
              </Stack>

              {liveRoomUrl && (
                <Button
                  component={Link}
                  to={`/live/${user?.creator?.id}`}
                  variant="contained"
                  sx={{ borderRadius: 999, bgcolor: "#d7263d", "&:hover": { bgcolor: "#bb2034" } }}
                >
                  Open viewer page
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
        </Stack>

        {user?.creator?.id && (
          <LiveChatPanel
            roomName={`creator:${user.creator.id}`}
            dark
            enabled
            title="Audience chat"
            subtitle="Messages are fanned out through Kafka, so this panel mirrors what viewers see on the public live page."
          />
        )}
      </Stack>
    </Box>
  );
}
