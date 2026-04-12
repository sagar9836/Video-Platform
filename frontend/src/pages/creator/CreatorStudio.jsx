import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import LiveTvIcon from "@mui/icons-material/LiveTv";
import RadioButtonCheckedIcon from "@mui/icons-material/RadioButtonChecked";
import RefreshIcon from "@mui/icons-material/Refresh";
import VideocamIcon from "@mui/icons-material/Videocam";

import { createChannel } from "../../api/creator.api";
import { fetchCreatorStudioGraphql } from "../../api/graphql.api";
import {
  cancelPremiereSession,
  endPremiereSession,
  fetchMyPremiereSession,
  schedulePremiereSession,
} from "../../api/live.api";
import { deleteCreatorVideo, updateVideoVisibility } from "../../api/video.api";
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
  "Open the browser live studio to preview your camera and microphone.",
  "Go live to publish directly into the creator room over WebRTC.",
  "Share the public room URL so viewers can join the live page instantly.",
];

export default function CreatorStudio() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const creator = user?.creator;

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [premiere, setPremiere] = useState(null);
  const [premiereVideoId, setPremiereVideoId] = useState("");
  const [premiereTitle, setPremiereTitle] = useState("");
  const [premiereDescription, setPremiereDescription] = useState("");
  const [premiereStartAt, setPremiereStartAt] = useState("");
  const [premiereSaving, setPremiereSaving] = useState(false);
  const [premiereCancelling, setPremiereCancelling] = useState(false);
  const [premiereEnding, setPremiereEnding] = useState(false);
  const [visibilitySavingId, setVisibilitySavingId] = useState(null);
  const [deletingVideoId, setDeletingVideoId] = useState(null);

  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");

  const liveRoomUrl = useMemo(() => {
    if (!creator?.id) {
      return "";
    }
    return `${window.location.origin}/live/${creator.id}`;
  }, [creator?.id]);

  const loadStudio = async () => {
    const [data, premiereData] = await Promise.all([
      fetchCreatorStudioGraphql(),
      fetchMyPremiereSession().catch(() => ({ premiere: null })),
    ]);
    const nextVideos = data?.videos || [];
    setVideos(nextVideos);
    setIsLive(Boolean(data?.isLive));
    setPremiere(premiereData?.premiere || null);
    if (
      !premiereVideoId ||
      !nextVideos.some((video) => String(video.id) === String(premiereVideoId))
    ) {
      const firstReadyVideo = nextVideos.find(
        (video) => String(video.status).toUpperCase() === "READY"
      );
      if (firstReadyVideo) {
        setPremiereVideoId(String(firstReadyVideo.id));
      } else {
        setPremiereVideoId("");
      }
    }
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
        const [data, premiereData] = await Promise.all([
          fetchCreatorStudioGraphql(),
          fetchMyPremiereSession().catch(() => ({ premiere: null })),
        ]);
        if (!mounted) {
          return;
        }
        const nextVideos = data?.videos || [];
        setVideos(nextVideos);
        setIsLive(Boolean(data?.isLive));
        setPremiere(premiereData?.premiere || null);
        if (
          !premiereVideoId ||
          !nextVideos.some((video) => String(video.id) === String(premiereVideoId))
        ) {
          const firstReadyVideo = nextVideos.find(
            (video) => String(video.status).toUpperCase() === "READY"
          );
          setPremiereVideoId(firstReadyVideo ? String(firstReadyVideo.id) : "");
        }
      } catch {
        if (mounted) {
          setError("Unable to load creator studio.");
        }
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

  const readyVideos = videos.filter((video) => String(video.status).toUpperCase() === "READY");

  const handleSchedulePremiere = async () => {
    if (!premiereVideoId || !premiereStartAt) {
      setError("Choose a ready video and a fixed start time.");
      return;
    }

    try {
      setPremiereSaving(true);
      setError("");
      setStatusMessage("");
      const payload = {
        video_id: Number(premiereVideoId),
        scheduled_start_at: new Date(premiereStartAt).toISOString(),
        ...(premiereTitle.trim() ? { title: premiereTitle.trim() } : {}),
        ...(premiereDescription.trim() ? { description: premiereDescription.trim() } : {}),
      };

      const data = await schedulePremiereSession(payload);
      setPremiere(data?.premiere || null);
      setStatusMessage("Scheduled premiere saved. Your public live page will switch over at the chosen time.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to schedule the premiere.");
    } finally {
      setPremiereSaving(false);
    }
  };

  const handleCancelPremiere = async () => {
    if (!premiere?.id) {
      return;
    }

    try {
      setPremiereCancelling(true);
      setError("");
      await cancelPremiereSession(premiere.id);
      setPremiere(null);
      setStatusMessage("Scheduled premiere cancelled.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to cancel the premiere.");
    } finally {
      setPremiereCancelling(false);
    }
  };

  const handleEndPremiere = async () => {
    if (!premiere?.id) {
      return;
    }

    try {
      setPremiereEnding(true);
      setError("");
      await endPremiereSession(premiere.id);
      setPremiere(null);
      setStatusMessage("Premiere ended. The public live page will return to the normal channel state.");
      await loadStudio();
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to end the premiere.");
    } finally {
      setPremiereEnding(false);
    }
  };

  const handleVisibilityChange = async (videoId, nextVisibility) => {
    try {
      setVisibilitySavingId(videoId);
      setError("");
      await updateVideoVisibility({ video_id: videoId, visibility: nextVisibility });
      setVideos((prev) =>
        prev.map((video) =>
          video.id === videoId ? { ...video, visibility: nextVisibility } : video
        )
      );
      const toggledVideo = videos.find((video) => video.id === videoId);
      setStatusMessage(
        `${toggledVideo?.title || "Video"} is now ${String(nextVisibility).toLowerCase()}.`
      );
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to update video visibility.");
    } finally {
      setVisibilitySavingId(null);
    }
  };

  const handleDeleteVideo = async (videoId) => {
    const targetVideo = videos.find((video) => video.id === videoId);
    if (!targetVideo) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${targetVideo.title}"? This removes the source upload, processed HLS files, and thumbnail.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setDeletingVideoId(videoId);
      setError("");
      await deleteCreatorVideo({ video_id: videoId });
      const remainingVideos = videos.filter((video) => video.id !== videoId);
      setVideos(remainingVideos);
      setStatusMessage(`"${targetVideo.title}" was deleted.`);

      if (String(premiereVideoId) === String(videoId)) {
        const remainingReadyVideo = remainingVideos.find(
          (video) => String(video.status).toUpperCase() === "READY"
        );
        setPremiereVideoId(remainingReadyVideo ? String(remainingReadyVideo.id) : "");
      }
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to delete the video.");
    } finally {
      setDeletingVideoId(null);
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
                  label={isLive ? "Broadcasting" : "Standby"}
                  sx={{
                    bgcolor: isLive ? "#e6485c" : "rgba(255,255,255,0.14)",
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
                Launch your room from the browser studio and send viewers into one clean
                live page with a single live workflow.
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
                  Open live studio
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
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="h5" fontWeight={800}>
                      Live workflow
                    </Typography>
                    <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                      The live architecture is now browser-first: preview locally,
                      publish the room, and send viewers to the public page.
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: "#fbf6ef",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>Creator studio</Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                      Open the live studio to access your camera and microphone directly
                      in the browser and publish into your room with one click.
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      background: "#fbf6ef",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>Audience path</Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary", wordBreak: "break-all" }}>
                      {liveRoomUrl}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2.25,
                      borderRadius: 3,
                      background: isLive ? "#fff1f2" : "#f3f0ec",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>Broadcast status</Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                      {isLive
                        ? "Your channel is live. Viewers can watch the room now."
                        : "You are offline. Open the browser live studio when you're ready to broadcast."}
                    </Typography>
                    {!isLive && premiere?.upcoming && (
                      <Typography sx={{ mt: 1.25, color: "text.secondary" }}>
                        Scheduled premiere: {premiere.title} at{" "}
                        {new Date(premiere.scheduled_start_at).toLocaleString()}.
                      </Typography>
                    )}
                    {isLive && (
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
                    variant="text"
                    onClick={refreshChannelProfile}
                    disabled={channelLoading}
                  >
                    {channelLoading ? "Refreshing..." : "Refresh profile"}
                  </Button>
                </Stack>

                <Divider sx={{ my: 3 }} />

                <Typography fontWeight={700}>Schedule cloud video premiere</Typography>
                <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                  Pick one of your processed uploads and send it live on the public page at a fixed time. Both public and private ready videos can be premiered here.
                </Typography>

                <TextField
                  select
                  fullWidth
                  label="Ready video"
                  value={premiereVideoId}
                  onChange={(event) => setPremiereVideoId(event.target.value)}
                  SelectProps={{ native: true }}
                  sx={{ mt: 2 }}
                  disabled={premiereSaving || readyVideos.length === 0}
                >
                  <option value="">
                    {readyVideos.length === 0 ? "No ready videos available" : "Select a video"}
                  </option>
                  {readyVideos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.title} ({String(video.visibility || "PUBLIC").toLowerCase()})
                    </option>
                  ))}
                </TextField>

                <TextField
                  label="Premiere title"
                  fullWidth
                  value={premiereTitle}
                  onChange={(event) => setPremiereTitle(event.target.value)}
                  sx={{ mt: 2 }}
                  placeholder="Leave blank to reuse the video title"
                />

                <TextField
                  label="Premiere description"
                  fullWidth
                  multiline
                  minRows={3}
                  value={premiereDescription}
                  onChange={(event) => setPremiereDescription(event.target.value)}
                  sx={{ mt: 2 }}
                  placeholder="Leave blank to reuse the video description"
                />

                <TextField
                  label="Start time"
                  type="datetime-local"
                  fullWidth
                  value={premiereStartAt}
                  onChange={(event) => setPremiereStartAt(event.target.value)}
                  sx={{ mt: 2 }}
                  InputLabelProps={{ shrink: true }}
                />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={handleSchedulePremiere}
                    disabled={premiereSaving || readyVideos.length === 0}
                  >
                    {premiereSaving ? "Saving..." : "Schedule premiere"}
                  </Button>
                  {premiere?.id && premiere?.upcoming && (
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={handleCancelPremiere}
                      disabled={premiereCancelling}
                    >
                      {premiereCancelling ? "Cancelling..." : "Cancel premiere"}
                    </Button>
                  )}
                  {premiere?.id && premiere?.live && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleEndPremiere}
                      disabled={premiereEnding}
                    >
                      {premiereEnding ? "Ending..." : "End premiere"}
                    </Button>
                  )}
                </Stack>

                {premiere && premiere.status !== "CANCELLED" && (
                  <Box
                    sx={{
                      mt: 2,
                      p: 2,
                      borderRadius: 3,
                      background: "#fbf6ef",
                      border: "1px solid rgba(59, 34, 20, 0.08)",
                    }}
                  >
                    <Typography fontWeight={700}>{premiere.title}</Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                      {premiere.live
                        ? "Premiere is live now."
                        : `Starts at ${new Date(premiere.scheduled_start_at).toLocaleString()}`}
                    </Typography>
                    <Typography sx={{ mt: 0.75, color: "text.secondary" }}>
                      Viewers will join through {liveRoomUrl} and watch the uploaded cloud video as a scheduled live event.
                    </Typography>
                  </Box>
                )}
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
                  Manage your on-demand catalog alongside live programming. Public videos appear for your audience; private videos stay visible only here in studio.
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
                    <Stack spacing={1.5}>
                      <VideoCard video={video} />
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: 3,
                          background: "#fbf7f2",
                          border: "1px solid rgba(56, 33, 25, 0.08)",
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Chip
                            size="small"
                            label={String(video.visibility || "PUBLIC").toLowerCase()}
                            sx={{
                              bgcolor:
                                String(video.visibility || "PUBLIC").toUpperCase() === "PRIVATE"
                                  ? "rgba(212, 127, 48, 0.16)"
                                  : "rgba(21, 101, 192, 0.10)",
                              color: "#3f2a21",
                              fontWeight: 700,
                            }}
                          />
                          <Chip
                            size="small"
                            label={String(video.status || "").toLowerCase()}
                            sx={{ bgcolor: "rgba(56, 33, 25, 0.08)", color: "#3f2a21", fontWeight: 700 }}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                          <Button
                            size="small"
                            variant={
                              String(video.visibility || "PUBLIC").toUpperCase() === "PUBLIC"
                                ? "outlined"
                                : "contained"
                            }
                            onClick={() => handleVisibilityChange(video.id, "PUBLIC")}
                            disabled={
                              visibilitySavingId === video.id ||
                              String(video.visibility || "PUBLIC").toUpperCase() === "PUBLIC"
                            }
                          >
                            {visibilitySavingId === video.id &&
                            String(video.visibility || "PUBLIC").toUpperCase() !== "PUBLIC"
                              ? "Saving..."
                              : "Make public"}
                          </Button>
                          <Button
                            size="small"
                            variant={
                              String(video.visibility || "PUBLIC").toUpperCase() === "PRIVATE"
                                ? "outlined"
                                : "contained"
                            }
                            color="inherit"
                            onClick={() => handleVisibilityChange(video.id, "PRIVATE")}
                            disabled={
                              visibilitySavingId === video.id ||
                              String(video.visibility || "PUBLIC").toUpperCase() === "PRIVATE"
                            }
                          >
                            {visibilitySavingId === video.id &&
                            String(video.visibility || "PUBLIC").toUpperCase() !== "PRIVATE"
                              ? "Saving..."
                              : "Make private"}
                          </Button>
                        </Stack>
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          sx={{ mt: 1.25 }}
                          onClick={() => handleDeleteVideo(video.id)}
                          disabled={deletingVideoId === video.id}
                        >
                          {deletingVideoId === video.id ? "Deleting..." : "Delete video"}
                        </Button>
                      </Box>
                    </Stack>
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
