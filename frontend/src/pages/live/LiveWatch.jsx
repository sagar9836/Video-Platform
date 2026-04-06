import { useEffect, useState } from "react";
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
import { fetchLivePlayback, fetchLiveStatus } from "../../api/live.api";

export default function LiveWatch() {
  const { creatorId } = useParams();

  const [channel, setChannel] = useState(null);
  const [streamUrl, setStreamUrl] = useState("");
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [channelData, statusData] = await Promise.all([
          fetchCreatorChannel(creatorId),
          fetchLiveStatus(creatorId),
        ]);

        if (!mounted) {
          return;
        }

        setChannel(channelData);
        setLive(Boolean(statusData?.live));

        if (statusData?.live) {
          const playback = await fetchLivePlayback(creatorId);
          if (!mounted) {
            return;
          }
          setStreamUrl(playback?.hls_url || "");
        } else {
          setStreamUrl("");
        }
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError(
          err?.response?.data?.detail || "Unable to load this live stream right now."
        );
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    const timer = window.setInterval(load, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [creatorId]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #16080b 0%, #2a1117 24%, #f6eee6 24%, #f6eee6 100%)",
        py: { xs: 4, md: 7 },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={live ? "Live Now" : "Offline"}
                sx={{
                  bgcolor: live ? "#d7263d" : "rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontWeight: 700,
                }}
              />
              <Typography sx={{ color: "#f8e9dd", opacity: 0.85 }}>
                Creator live room
              </Typography>
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
              {channel?.channel_name || "Live stream"}
            </Typography>

            {channel?.description && (
              <Typography sx={{ color: "#f8e9dd", maxWidth: 820 }}>
                {channel.description}
              </Typography>
            )}
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          {live && streamUrl ? (
            <LiveStreamPlayer src={streamUrl} />
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
                When the creator goes live, this page will automatically start showing
                the stream. You can keep it open or check back in a bit.
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <Button component={Link} to={`/channel/${creatorId}`} variant="contained">
                  Back to channel
                </Button>
              </Stack>
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
                About this room
              </Typography>
              <Typography color="#5b4036" sx={{ mt: 0.5 }}>
                Live playback is delivered over HLS and refreshes every few seconds to
                pick up status changes without forcing a page reload.
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
