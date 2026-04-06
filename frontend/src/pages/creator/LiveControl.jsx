import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import RefreshIcon from "@mui/icons-material/Refresh";
import SensorsIcon from "@mui/icons-material/Sensors";
import LiveTvIcon from "@mui/icons-material/LiveTv";

import {
  fetchLivePlayback,
  fetchLiveSetup,
  issueLiveStreamKey,
} from "../../api/live.api";
import { useAuth } from "../../auth/AuthContext";
import LiveStreamPlayer from "../../components/live/LiveStreamPlayer";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
} from "@mui/material";

const checklist = [
  "Open OBS or your preferred encoder.",
  "Paste the server URL into Stream settings.",
  "Paste the stream key exactly as shown.",
  "Start streaming in OBS and then refresh this page.",
];

export default function LiveControl() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [setup, setSetup] = useState({
    creator_id: null,
    rtmp_url: "",
    stream_key: "",
    live: false,
    playback_url: "",
  });
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const liveRoomUrl = useMemo(() => {
    if (!setup.creator_id) return "";
    return `${window.location.origin}/live/${setup.creator_id}`;
  }, [setup.creator_id]);

  const loadSetup = async () => {
    const data = await fetchLiveSetup();
    setSetup({
      creator_id: data?.creator_id ?? null,
      rtmp_url: data?.rtmp_url || "",
      stream_key: data?.stream_key || "",
      live: Boolean(data?.live),
      playback_url: data?.playback_url || "",
    });

    if (data?.creator_id && data?.live) {
      const playback = await fetchLivePlayback(data.creator_id);
      setSetup((prev) => ({
        ...prev,
        playback_url: playback?.hls_url || prev.playback_url,
      }));
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        setLoading(true);
        setError("");
        await loadSetup();
      } catch (err) {
        if (!mounted) return;
        setError(err?.response?.data?.detail || "Unable to load live setup.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();
    const timer = window.setInterval(() => {
      run().catch(() => {});
    }, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const refreshStatus = async () => {
    try {
      setRefreshing(true);
      setError("");
      await loadSetup();
      setStatusMessage(setup.live ? "Live status refreshed." : "Waiting for encoder to go live.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to refresh live status.");
    } finally {
      setRefreshing(false);
    }
  };

  const rotateKey = async () => {
    try {
      setRotating(true);
      setError("");
      setStatusMessage("");
      const data = await issueLiveStreamKey();
      setSetup((prev) => ({
        ...prev,
        rtmp_url: data?.rtmp_url || prev.rtmp_url,
        stream_key: data?.stream_key || prev.stream_key,
      }));
      setStatusMessage("A new stream key has been issued.");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to rotate stream key.");
    } finally {
      setRotating(false);
    }
  };

  const copyValue = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
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

  return (
    <Box
      sx={{
        maxWidth: 1240,
        mx: "auto",
        mt: 4,
        px: { xs: 2, md: 3 },
        pb: 5,
      }}
    >
      <Stack direction={{ xs: "column", lg: "row" }} spacing={3}>
        <Card
          sx={{
            flex: 1.15,
            borderRadius: 5,
            color: "#fff",
            background:
              "linear-gradient(135deg, rgba(12,12,12,0.98) 0%, rgba(33,12,12,0.95) 54%, rgba(90,18,18,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <Button
                onClick={() => navigate("/creator")}
                sx={{ width: "fit-content", px: 0, color: "rgba(255,255,255,0.72)" }}
              >
                Back to Creator Studio
              </Button>

              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  icon={<SensorsIcon sx={{ color: "inherit !important" }} />}
                  label={setup.live ? "Live Now" : "Ready to Go Live"}
                  sx={{
                    width: "fit-content",
                    borderRadius: 999,
                    bgcolor: setup.live ? "#ff0000" : "rgba(255,255,255,0.12)",
                    color: "#fff",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  label={user?.creator?.channel_name || "Creator channel"}
                  sx={{
                    borderRadius: 999,
                    bgcolor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                />
              </Stack>

              <Typography variant="h3" fontWeight={800} sx={{ letterSpacing: "-0.05em", maxWidth: 680 }}>
                Start your live stream from one control page.
              </Typography>

              <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 640 }}>
                This page gives you the exact RTMP server, stream key, public watch link,
                and a live preview once OBS starts publishing to nginx-rtmp.
              </Typography>

              <Stack spacing={1.4} sx={{ pt: 1 }}>
                {checklist.map((item) => (
                  <Box
                    key={item}
                    sx={{
                      px: 2,
                      py: 1.4,
                      borderRadius: 3,
                      bgcolor: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <Typography fontWeight={600}>{item}</Typography>
                  </Box>
                ))}
              </Stack>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ pt: 1 }}>
                <Button
                  variant="contained"
                  startIcon={<RefreshIcon />}
                  onClick={refreshStatus}
                  disabled={refreshing}
                  sx={{ borderRadius: 999, bgcolor: "#ff0000", "&:hover": { bgcolor: "#e00000" } }}
                >
                  {refreshing ? "Refreshing..." : "Refresh Live Status"}
                </Button>
                {liveRoomUrl && (
                  <Button
                    component={Link}
                    to={`/live/${setup.creator_id}`}
                    variant="outlined"
                    startIcon={<LiveTvIcon />}
                    sx={{ borderRadius: 999, color: "#fff", borderColor: "rgba(255,255,255,0.26)" }}
                  >
                    Open Public Live Room
                  </Button>
                )}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card
          sx={{
            flex: 0.95,
            borderRadius: 5,
            bgcolor: "rgba(18,18,18,0.96)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2.2}>
              <Typography variant="h5" fontWeight={800}>
                Live setup details
              </Typography>

              {error && (
                <Alert severity="error" sx={{ borderRadius: 3, bgcolor: "rgba(211,47,47,0.18)", color: "#fff" }}>
                  {error}
                </Alert>
              )}

              {statusMessage && (
                <Alert severity="success" sx={{ borderRadius: 3, bgcolor: "rgba(46,125,50,0.18)", color: "#fff" }}>
                  {statusMessage}
                </Alert>
              )}

              {[
                { label: "RTMP Server URL", value: setup.rtmp_url, copyKey: "server" },
                { label: "Stream Key", value: setup.stream_key, copyKey: "stream_key" },
                { label: "Public Live URL", value: liveRoomUrl, copyKey: "live_room" },
              ].map((field) => (
                <Box
                  key={field.label}
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.56)", fontSize: 13 }}>
                    {field.label}
                  </Typography>
                  <Typography sx={{ mt: 0.8, wordBreak: "break-all", fontWeight: 700 }}>
                    {field.value || "Not available yet"}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={() => copyValue(field.copyKey, field.value)}
                    sx={{ mt: 1, px: 0, color: copied === field.copyKey ? "#ff9b9b" : "#fff" }}
                  >
                    {copied === field.copyKey ? "Copied" : "Copy"}
                  </Button>
                </Box>
              ))}

              <Button
                variant="outlined"
                onClick={rotateKey}
                disabled={rotating}
                sx={{
                  borderRadius: 999,
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.18)",
                }}
              >
                {rotating ? "Rotating key..." : "Rotate Stream Key"}
              </Button>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />

              <Box>
                <Typography fontWeight={800}>Preview</Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.6)", mt: 0.5 }}>
                  {setup.live
                    ? "Your stream is live. Preview should start below."
                    : "Once OBS starts publishing, this page will show the stream preview here."}
                </Typography>
              </Box>

              {setup.live && setup.playback_url ? (
                <LiveStreamPlayer src={setup.playback_url} posterHeight={280} />
              ) : (
                <Box
                  sx={{
                    minHeight: 280,
                    borderRadius: 4,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,0.04)",
                    border: "1px dashed rgba(255,255,255,0.12)",
                    textAlign: "center",
                    px: 3,
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={800}>
                      Waiting for stream signal
                    </Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.6)", mt: 1 }}>
                      Start streaming in OBS with the server URL and stream key above,
                      then refresh status to confirm the live session.
                    </Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
