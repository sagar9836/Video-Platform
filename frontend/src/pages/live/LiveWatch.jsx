import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from "@mui/material";

import LiveStreamPlayer from "../../components/live/LiveStreamPlayer";
import { fetchCreatorChannel } from "../../api/creator.api";
import { fetchLiveRoom, issueViewerToken } from "../../api/live.api";

const LIVEKIT_CONNECT_OPTIONS = {
  maxRetries: 4,
  peerConnectionTimeout: 25000,
  websocketTimeout: 25000,
};

export default function LiveWatch() {
  const { creatorId } = useParams();

  const roomRef = useRef(null);
  const videoHostRef = useRef(null);
  const audioHostRef = useRef(null);
  const videoWatchdogRef = useRef(null);
  const hasVideoTrackRef = useRef(false);

  const [channel, setChannel] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [premiereStartOffset, setPremiereStartOffset] = useState(0);

  useEffect(() => {
    let mounted = true;
    let reconnectTimer = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const clearVideoWatchdog = () => {
      if (videoWatchdogRef.current) {
        clearTimeout(videoWatchdogRef.current);
        videoWatchdogRef.current = null;
      }
    };

    const disconnectRoom = () => {
      if (roomRef.current) {
        const activeRoom = roomRef.current;
        roomRef.current = null;
        activeRoom.disconnect();
      }
    };

    const resetMediaHosts = () => {
      if (videoHostRef.current) {
        videoHostRef.current.innerHTML = "";
      }
      if (audioHostRef.current) {
        audioHostRef.current.innerHTML = "";
      }
      hasVideoTrackRef.current = false;
      setHasVideoTrack(false);
    };

    const cleanup = () => {
      clearReconnectTimer();
      clearVideoWatchdog();
      disconnectRoom();
      resetMediaHosts();
    };

    const scheduleReconnect = (delay = 5000) => {
      clearReconnectTimer();
      reconnectTimer = setTimeout(() => {
        if (mounted) {
          load({ silent: true });
        }
      }, delay);
    };

    const attachTrack = async (track) => {
      const host = track.kind === "video" ? videoHostRef.current : audioHostRef.current;
      if (!host) {
        return;
      }

      const existing = host.querySelector(`[data-track-sid="${track.sid}"]`);
      if (existing) {
        return;
      }

      const element = track.attach();
      element.dataset.trackSid = track.sid;
      element.autoplay = true;
      element.playsInline = true;
      element.controls = false;
      if (track.kind === "video") {
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.objectFit = "cover";
        element.style.borderRadius = "24px";
        hasVideoTrackRef.current = true;
        setHasVideoTrack(true);
        clearVideoWatchdog();
      } else {
        element.style.display = "none";
      }

      host.appendChild(element);

      try {
        await element.play();
      } catch {
        // The browser may delay autoplay for remote media until enough data arrives.
      }
    };

    const detachTrack = (track) => {
      try {
        track.detach().forEach((element) => element.remove());
      } catch {
        // Ignore track detach failures during teardown.
      }

      const host = track.kind === "video" ? videoHostRef.current : audioHostRef.current;
      const attached = host?.querySelector(`[data-track-sid="${track.sid}"]`);
      attached?.remove();

      if (track.kind === "video") {
        const hasRemainingVideo = Boolean(videoHostRef.current?.querySelector("video"));
        hasVideoTrackRef.current = hasRemainingVideo;
        setHasVideoTrack(hasRemainingVideo);
      }
    };

    const attachParticipantTracks = (participant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.track) {
          attachTrack(publication.track);
        }
      });
    };

    const connectViewer = async (creatorRoom) => {
      setConnecting(true);
      setError("");
      clearVideoWatchdog();

      try {
        const tokenData = await issueViewerToken(Number(creatorId));
        const { Room, RoomEvent } = await import("livekit-client");
        disconnectRoom();
        resetMediaHosts();

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          disconnectOnPageLeave: false,
        });

        room.on(RoomEvent.TrackSubscribed, (track) => {
          attachTrack(track);
        });

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          detachTrack(track);
        });

        room.on(RoomEvent.ParticipantConnected, (participant) => {
          attachParticipantTracks(participant);
        });

        room.on(RoomEvent.TrackPublished, (_publication, participant) => {
          attachParticipantTracks(participant);
        });

        room.on(RoomEvent.Reconnecting, () => {
          setConnecting(true);
        });

        room.on(RoomEvent.Reconnected, async () => {
          setConnecting(false);
          try {
            await room.startAudio();
          } catch {
            // Some browsers still require a user gesture before audio can resume.
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current !== room) {
            return;
          }

          if (mounted) {
            resetMediaHosts();
            setConnecting(true);
          }

          roomRef.current = null;
          clearVideoWatchdog();
          scheduleReconnect(3000);
        });

        room.prepareConnection(tokenData.url, tokenData.token);
        await room.connect(tokenData.url, tokenData.token, LIVEKIT_CONNECT_OPTIONS);
        try {
          await room.startAudio();
        } catch {
          // Some browsers require user interaction before audio can begin.
        }

        room.remoteParticipants.forEach((participant) => {
          attachParticipantTracks(participant);
        });

        roomRef.current = room;
        videoWatchdogRef.current = setTimeout(() => {
          if (!mounted || roomRef.current !== room || hasVideoTrackRef.current) {
            return;
          }

          setError("Connected to the live room, but no video arrived yet. Retrying the viewer connection...");
          disconnectRoom();
          scheduleReconnect(2000);
        }, 8000);

        if (mounted) {
          setRoomState((prev) => ({
            ...(prev || creatorRoom),
            live: true,
            session: tokenData.session || prev?.session || creatorRoom?.session,
          }));
        }
      } catch (err) {
        const detail =
          err?.response?.data?.detail ||
          err?.message ||
          "Unable to connect to the live room.";

        if (mounted) {
          setError(detail);
          if (detail === "Creator not live") {
            setRoomState((prev) => (prev ? { ...prev, live: false } : prev));
            scheduleReconnect(3000);
          }
        }
      } finally {
        if (mounted) {
          setConnecting(false);
        }
      }
    };

    const load = async ({ silent = false } = {}) => {
      try {
        clearReconnectTimer();
        if (!silent) {
          setLoading(true);
        }
        setError("");

        const [channelData, roomData] = await Promise.all([
          fetchCreatorChannel(creatorId),
          fetchLiveRoom(creatorId),
        ]);

        if (!mounted) {
          return;
        }

        setChannel(channelData);
        setRoomState(roomData);

        if (roomData?.live && roomData?.stream_type === "webrtc") {
          await connectViewer(roomData);
        } else if (roomData?.live && roomData?.stream_type === "premiere") {
          disconnectRoom();
          resetMediaHosts();
          if (roomData?.premiere?.scheduled_start_at) {
            const scheduledStart = new Date(roomData.premiere.scheduled_start_at).getTime();
            setPremiereStartOffset(Math.max(0, Math.floor((Date.now() - scheduledStart) / 1000)));
          } else {
            setPremiereStartOffset(0);
          }
        } else {
          disconnectRoom();
          resetMediaHosts();
          setPremiereStartOffset(0);
          scheduleReconnect(5000);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err?.response?.data?.detail ||
              "Unable to load this live stream right now."
          );
          scheduleReconnect(5000);
        }
      } finally {
        if (mounted && !silent) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [creatorId]);

  useEffect(() => {
    const premiereScheduledAt = roomState?.premiere?.scheduled_start_at;
    if (!premiereScheduledAt) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [roomState?.premiere?.scheduled_start_at]);

  useEffect(() => {
    const premiereScheduledAt = roomState?.premiere?.scheduled_start_at;
    if (!premiereScheduledAt || roomState?.stream_type !== "premiere" || roomState?.live) {
      return undefined;
    }

    const scheduledStart = new Date(premiereScheduledAt).getTime();
    const delay = scheduledStart - Date.now();
    if (delay <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      window.location.reload();
    }, Math.min(delay + 500, 2147483647));

    return () => window.clearTimeout(timer);
  }, [roomState?.premiere?.scheduled_start_at, roomState?.stream_type, roomState?.live]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isLive = Boolean(roomState?.live);
  const isPremiere = roomState?.stream_type === "premiere";
  const premiere = roomState?.premiere || null;
  const scheduledStartMs = premiere?.scheduled_start_at
    ? new Date(premiere.scheduled_start_at).getTime()
    : null;
  const countdownMs =
    premiere?.upcoming && scheduledStartMs ? Math.max(scheduledStartMs - nowMs, 0) : 0;
  const countdownHours = Math.floor(countdownMs / 3600000);
  const countdownMinutes = Math.floor((countdownMs % 3600000) / 60000);
  const countdownSeconds = Math.floor((countdownMs % 60000) / 1000);
  const countdownLabel = `${String(countdownHours).padStart(2, "0")}:${String(
    countdownMinutes
  ).padStart(2, "0")}:${String(countdownSeconds).padStart(2, "0")}`;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #120609 0%, #2a1117 24%, #f6eee6 24%, #f6eee6 100%)",
        py: { xs: 4, md: 7 },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={isLive ? (isPremiere ? "Premiere live" : "Live now") : premiere?.upcoming ? "Scheduled" : "Offline"}
                sx={{
                  bgcolor: isLive ? "#d7263d" : "rgba(255,255,255,0.14)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              />
              {roomState?.session?.viewer_count ? (
                <Chip
                  label={`${roomState.session.viewer_count} watching`}
                  sx={{
                    bgcolor: "rgba(255,255,255,0.12)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                />
              ) : null}
            </Stack>

            <Typography
              variant="h3"
              sx={{
                color: "#fff7ef",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                maxWidth: 900,
              }}
            >
              {premiere?.title || roomState?.session?.title || channel?.channel_name || "Live stream"}
            </Typography>

            <Typography sx={{ color: "#f8e9dd", maxWidth: 840 }}>
              {premiere?.description ||
                roomState?.session?.description ||
                channel?.description ||
                "Join the room live as the creator broadcasts from the in-browser WebRTC studio."}
            </Typography>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {isPremiere && premiere?.live && premiere?.playback_url ? (
            <Box>
              <LiveStreamPlayer
                src={premiere.playback_url}
                posterHeight={620}
                muted
                initialOffsetSeconds={premiereStartOffset}
              />
            </Box>
          ) : isLive ? (
            <Box
              sx={{
                minHeight: { xs: 320, md: 620 },
                borderRadius: 4,
                overflow: "hidden",
                position: "relative",
                bgcolor: "#050505",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <Box
                ref={videoHostRef}
                sx={{
                  position: "absolute",
                  inset: 0,
                }}
              />
              <Box ref={audioHostRef} sx={{ display: "none" }} />
              {!connecting && !hasVideoTrack && (
                <Stack
                  spacing={1.5}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    zIndex: 1,
                  }}
                >
                  <CircularProgress sx={{ color: "#fff" }} size={28} />
                  <Typography sx={{ color: "rgba(255,255,255,0.82)" }}>
                    Waiting for the creator&apos;s video track...
                  </Typography>
                </Stack>
              )}
              {connecting && (
                <Stack
                  spacing={2}
                  sx={{
                    position: "absolute",
                    inset: 0,
                    alignItems: "center",
                    justifyContent: "center",
                    bgcolor: "rgba(5,5,5,0.48)",
                    zIndex: 1,
                  }}
                >
                  <CircularProgress sx={{ color: "#fff" }} />
                  <Typography sx={{ color: "#fff" }}>
                    Joining the live room...
                  </Typography>
                </Stack>
              )}
            </Box>
          ) : premiere?.upcoming ? (
            <Box
              sx={{
                borderRadius: 4,
                p: { xs: 3, md: 5 },
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.88), rgba(240,224,209,0.95))",
                border: "1px solid rgba(69, 34, 20, 0.08)",
              }}
            >
              <Typography variant="h4" fontWeight={800} color="#2a1117" gutterBottom>
                Upcoming premiere
              </Typography>
              <Typography color="#5b4036" sx={{ maxWidth: 760, mb: 1.5 }}>
                {premiere.title} will start at{" "}
                {new Date(premiere.scheduled_start_at).toLocaleString()}.
              </Typography>
              <Typography color="#5b4036" sx={{ maxWidth: 760, mb: 3 }}>
                Keep this page open and it will switch into playback automatically when the premiere starts.
              </Typography>
              <Chip
                label={`Starts in ${countdownLabel}`}
                sx={{
                  bgcolor: "#2a1117",
                  color: "#fff",
                  fontWeight: 800,
                  mb: 3,
                }}
              />
              <Box>
                <Button component={Link} to={`/channel/${creatorId}`} variant="contained">
                  Back to channel
                </Button>
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                borderRadius: 4,
                p: { xs: 3, md: 5 },
                background:
                  "linear-gradient(135deg, rgba(255,255,255,0.88), rgba(240,224,209,0.95))",
                border: "1px solid rgba(69, 34, 20, 0.08)",
              }}
            >
              <Typography variant="h4" fontWeight={800} color="#2a1117" gutterBottom>
                This channel is offline right now
              </Typography>
              <Typography color="#5b4036" sx={{ maxWidth: 700, mb: 3 }}>
                The creator is not broadcasting at this moment. Keep this page open or
                come back shortly and it will connect as soon as the room goes live.
              </Typography>
              <Button component={Link} to={`/channel/${creatorId}`} variant="contained">
                Back to channel
              </Button>
            </Box>
          )}

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{
              p: 3,
              borderRadius: 4,
              background: "rgba(255, 248, 241, 0.86)",
              border: "1px solid rgba(83, 43, 28, 0.08)",
            }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={800} color="#2a1117">
                Playback path
              </Typography>
              <Typography color="#5b4036" sx={{ mt: 0.5 }}>
                {isPremiere
                  ? "This page is using a scheduled cloud-video premiere path so viewers can join a fixed-time playback event."
                  : "This page now connects directly to the creator&apos;s LiveKit room over WebRTC instead of waiting on generated HLS playlists."}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={800} color="#2a1117">
                Audience snapshot
              </Typography>
              <Typography color="#5b4036" sx={{ mt: 0.5 }}>
                {channel?.subscribers_count ?? 0} subscribers following this creator.
              </Typography>
            </Box>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
