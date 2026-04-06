import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RefreshIcon from "@mui/icons-material/Refresh";
import VideocamIcon from "@mui/icons-material/Videocam";

import { createChannel } from "../../api/creator.api";
import { fetchCreatorStudioGraphql } from "../../api/graphql.api";
import { issueLiveStreamKey } from "../../api/live.api";
import { useAuth } from "../../auth/AuthContext";
import VideoCard from "../../components/common/VideoCard";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

const instructions = [
  "Server URL: paste the RTMP URL into OBS Stream settings.",
  "Stream key: keep it private and rotate it any time you think it has leaked.",
  "Playback: once OBS starts publishing, viewers can open your live room instantly.",
];

export default function CreatorStudio() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const creator = user?.creator;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState(false);
  const [keyLoading, setKeyLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState("");

  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");

  const [streamInfo, setStreamInfo] = useState({
    rtmp_url: "",
    stream_key: "",
    live: false,
  });

  const liveRoomUrl = useMemo(() => {
    if (!creator?.id) {
      return "";
    }
    return `${window.location.origin}/live/${creator.id}`;
  }, [creator?.id]);

  const loadStudio = async () => {
    const data = await fetchCreatorStudioGraphql();
    setVideos(data?.videos || []);
    setStreamInfo((prev) => ({
      ...prev,
      live: Boolean(data?.isLive),
    }));
  };

  useEffect(() => {
    if (!creator) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchCreatorStudioGraphql();
        if (!mounted) {
          return;
        }
        setVideos(data?.videos || []);
        setStreamInfo((prev) => ({
          ...prev,
          live: Boolean(data?.isLive),
        }));
      } catch {
        if (!mounted) {
          return;
        }
        setError("Unable to load creator studio.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    run();
    const timer = window.setInterval(run, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [creator]);

  const handleCreateChannel = async () => {
    if (!channelName.trim()) {
      setError("Channel name is required.");
      return;
    }

    try {
      setSavingChannel(true);
      setError("");
      setStatusMessage("");

      await createChannel({
        channel_name: channelName,
        description,
      });

      await refreshUser();
      setStatusMessage("Channel created. Your creator studio is ready.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to create channel.");
    } finally {
      setSavingChannel(false);
    }
  };

  const handleIssueKey = async () => {
    try {
      setKeyLoading(true);
      setError("");
      setStatusMessage("");

      const data = await issueLiveStreamKey();
      setStreamInfo((prev) => ({
        ...prev,
        rtmp_url: data?.rtmp_url || "",
        stream_key: data?.stream_key || "",
      }));
      setStatusMessage("A fresh stream key has been issued for your next live session.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to issue stream key.");
    } finally {
      setKeyLoading(false);
    }
  };

  const refreshLiveStatus = async () => {
    if (!creator?.id) {
      return;
    }

    try {
      setLiveLoading(true);
      await loadStudio();
    } catch {
      setError("Unable to refresh live status.");
    } finally {
      setLiveLoading(false);
    }
  };

  const refreshChannelProfile = async () => {
    try {
      setChannelLoading(true);
      await refreshUser();
      await loadStudio();
      setStatusMessage("Creator profile refreshed.");
    } catch {
      setError("Unable to refresh your profile.");
    } finally {
      setChannelLoading(false);
    }
  };

  const copyText = async (label, value) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(""), 1600);
    } catch {
      setError(`Unable to copy ${label}.`);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!creator) {
    return (
      <Box sx={{ maxWidth: 560, mx: "auto", mt: 6 }}>
        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" fontWeight="bold">
              Create Your Channel
            </Typography>

            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Set up your identity first, then you can start streaming and uploading.
            </Typography>

            <TextField
              label="Channel Name"
              fullWidth
              margin="normal"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
            />

            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              margin="normal"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              onClick={handleCreateChannel}
              disabled={savingChannel}
            >
              {savingChannel ? "Creating..." : "Create Channel"}
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
        background:
          "linear-gradient(180deg, #f3ece3 0%, #f8f4ed 35%, #fffdf9 100%)",
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }}>
        <Box
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 6,
            color: "#fff6ed",
            background:
              "linear-gradient(135deg, #20110f 0%, #5e1f22 55%, #b2394f 100%)",
            boxShadow: "0 24px 60px rgba(83, 20, 28, 0.26)",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={3}
            justifyContent="space-between"
          >
            <Box sx={{ maxWidth: 720 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Chip
                  icon={<RadioButtonCheckedIcon sx={{ color: "inherit !important" }} />}
                  label={streamInfo.live ? "Broadcasting" : "Standby"}
                  sx={{
                    bgcolor: streamInfo.live ? "#e6485c" : "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                />
                <Typography sx={{ opacity: 0.8 }}>Creator control room</Typography>
              </Stack>

              <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
                {creator.channel_name}
              </Typography>

              <Typography sx={{ mt: 1.5, maxWidth: 620, color: "rgba(255,246,237,0.84)" }}>
                Launch your live room, rotate keys safely, and share one polished watch
                page with your audience from a single dashboard.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  startIcon={<LiveTvIcon />}
                  component={Link}
                  to="/creator/live"
                  sx={{
                    bgcolor: "#fff2e3",
                    color: "#4a161c",
                    fontWeight: 700,
                    "&:hover": { bgcolor: "#ffe6cf" },
                  }}
                >
                  Start live setup
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={refreshLiveStatus}
                  disabled={liveLoading}
                  sx={{
                    borderColor: "rgba(255,255,255,0.4)",
                    color: "#fff9f2",
                  }}
                >
                  {liveLoading ? "Checking..." : "Refresh status"}
                </Button>
              </Stack>
            </Box>

            <Stack spacing={1.5} sx={{ minWidth: { md: 260 } }}>
              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  bgcolor: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <Typography sx={{ opacity: 0.84 }}>Subscribers</Typography>
                <Typography variant="h4" fontWeight={800}>
                  {creator.subscribers_count || 0}
                </Typography>
              </Box>

              <Box
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  bgcolor: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(10px)",
                }}
              >
                <Typography sx={{ opacity: 0.84 }}>Uploads</Typography>
                <Typography variant="h4" fontWeight={800}>
                  {videos.length}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>

        {(error || statusMessage) && (
          <Stack spacing={1}>
            {error && <Alert severity="error">{error}</Alert>}
            {statusMessage && <Alert severity="success">{statusMessage}</Alert>}
          </Stack>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Card sx={{ height: "100%", borderRadius: 5, boxShadow: "none", border: "1px solid rgba(56, 33, 25, 0.08)" }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  spacing={2}
                >
                  <Box>
                    <Typography variant="h5" fontWeight={800}>
                      Live setup
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                      Everything your encoder needs to publish a stream to the platform.
                    </Typography>
                  </Box>

                  <Button
                    variant="contained"
                    onClick={handleIssueKey}
                    disabled={keyLoading}
                    startIcon={<RefreshIcon />}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    {keyLoading ? "Rotating..." : "Rotate Key"}
                  </Button>
                </Stack>

                <Stack spacing={2} sx={{ mt: 3 }}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: "#fbf6ef",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>RTMP Server</Typography>
                    <Typography sx={{ mt: 0.75, fontFamily: "monospace", wordBreak: "break-all" }}>
                      {streamInfo.rtmp_url || "Issue a stream key to generate your ingest settings."}
                    </Typography>
                    <Button
                      size="small"
                      sx={{ mt: 1.5 }}
                      startIcon={<ContentCopyIcon />}
                      onClick={() => copyText("server url", streamInfo.rtmp_url)}
                      disabled={!streamInfo.rtmp_url}
                    >
                      {copiedField === "server url" ? "Copied" : "Copy server"}
                    </Button>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: "#fbf6ef",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>Stream Key</Typography>
                    <Typography sx={{ mt: 0.75, fontFamily: "monospace", wordBreak: "break-all" }}>
                      {streamInfo.stream_key || "Issue a key to unlock live streaming."}
                    </Typography>
                    <Button
                      size="small"
                      sx={{ mt: 1.5 }}
                      startIcon={<ContentCopyIcon />}
                      onClick={() => copyText("stream key", streamInfo.stream_key)}
                      disabled={!streamInfo.stream_key}
                    >
                      {copiedField === "stream key" ? "Copied" : "Copy key"}
                    </Button>
                  </Box>

                  <Box
                    sx={{
                      p: 2.25,
                      borderRadius: 3,
                      background: streamInfo.live ? "#fff1f2" : "#f3f0ec",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>Broadcast status</Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                      {streamInfo.live
                        ? "Your channel is live. Viewers can watch the stream page now."
                        : "You are offline. Start publishing from OBS to go live."}
                    </Typography>
                    {streamInfo.live && (
                      <Button
                        component={Link}
                        to={`/live/${creator.id}`}
                        sx={{ mt: 1.5 }}
                        variant="contained"
                        color="error"
                      >
                        Watch public live page
                      </Button>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Card sx={{ height: "100%", borderRadius: 5, boxShadow: "none", border: "1px solid rgba(56, 33, 25, 0.08)" }}>
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <VideocamIcon sx={{ color: "#9f2439" }} />
                  <Typography variant="h5" fontWeight={800}>
                    Broadcast guide
                  </Typography>
                </Stack>

                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  A clean handoff from creator dashboard to live playback.
                </Typography>

                <Stack spacing={1.5} sx={{ mt: 3 }}>
                  {instructions.map((item) => (
                    <Box
                      key={item}
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        background: "#fcf8f3",
                        border: "1px solid rgba(56, 33, 25, 0.08)",
                      }}
                    >
                      <Typography color="#4d332b">{item}</Typography>
                    </Box>
                  ))}
                </Stack>

                <Divider sx={{ my: 3 }} />

                <Typography fontWeight={700}>Public room URL</Typography>
                <Typography
                  sx={{
                    mt: 1,
                    color: "text.secondary",
                    fontFamily: "monospace",
                    wordBreak: "break-all",
                  }}
                >
                  {liveRoomUrl}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copyText("live room", liveRoomUrl)}
                  >
                    {copiedField === "live room" ? "Copied" : "Copy live room"}
                  </Button>
                  <Button
                    variant="text"
                    onClick={refreshChannelProfile}
                    disabled={channelLoading}
                  >
                    {channelLoading ? "Refreshing..." : "Refresh profile"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Card sx={{ borderRadius: 5, boxShadow: "none", border: "1px solid rgba(56, 33, 25, 0.08)" }}>
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", sm: "center" }}
              spacing={2}
              sx={{ mb: 3 }}
            >
              <Box>
                <Typography variant="h5" fontWeight={800}>
                  Your videos
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Manage your on-demand catalog alongside live programming.
                </Typography>
              </Box>

              <Button variant="contained" onClick={() => navigate("/creator/upload")}>
                Upload Video
              </Button>
            </Stack>

            {videos.length === 0 ? (
              <Box
                sx={{
                  p: 4,
                  borderRadius: 4,
                  background: "#fbf7f2",
                  border: "1px dashed rgba(56, 33, 25, 0.18)",
                }}
              >
                <Typography fontWeight={700}>No videos uploaded yet</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  Start with a VOD upload or go live first and build your channel momentum.
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={3}>
                {videos.map((video) => (
                  <Grid item key={video.id} xs={12} sm={6} md={4} lg={3}>
                    <VideoCard video={video} />
                  </Grid>
                ))}
              </Grid>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
