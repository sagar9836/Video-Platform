import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useEffect, useState } from "react";
import {
  ensureGuestSession,
  getGuestSessionRemainingMs,
  GUEST_SESSION_LIMIT_MS,
} from "../auth/guestSession";

import VideoCard from "../components/common/VideoCard";
import { fetchDashboardFeedGraphql } from "../api/graphql.api";

import {
  Box,
  Grid,
  Typography,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";

function formatRemaining(ms) {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function Dashboard() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guestRemainingMs, setGuestRemainingMs] = useState(GUEST_SESSION_LIMIT_MS);

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const data = await fetchDashboardFeedGraphql();
        setVideos(data);
      } catch (err) {
        console.error("Failed to load dashboard feed", err);
      } finally {
        setLoading(false);
      }
    };

    loadVideos();
  }, []);

  useEffect(() => {
    if (user) return;

    ensureGuestSession();
    setGuestRemainingMs(getGuestSessionRemainingMs());

    const timer = window.setInterval(() => {
      setGuestRemainingMs(getGuestSessionRemainingMs());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [user]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "transparent",
      }}
    >
      <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 2, md: 4 }, maxWidth: 1440, mx: "auto" }}>
        <Box
          sx={{
            mb: 3,
            p: { xs: 3, md: 4 },
            borderRadius: 4,
            overflow: "hidden",
            position: "relative",
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(18,18,18,0.82) 42%, rgba(18,18,18,0.25) 100%)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              width: 260,
              height: 260,
              borderRadius: "50%",
              right: -40,
              top: -50,
              background: "radial-gradient(circle, rgba(245,185,90,0.35), transparent 70%)",
            }}
          />
          <Stack
            direction={{ xs: "column", lg: "row" }}
            justifyContent="space-between"
            spacing={4}
            sx={{ position: "relative", zIndex: 1 }}
          >
            <Box sx={{ maxWidth: 720 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
                <Chip
                  label="Recommended"
                  sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, borderRadius: 999 }}
                />
                {!user && (
                  <Chip
                    label={`Guest pass ${formatRemaining(guestRemainingMs)} left`}
                    sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "#fff", fontWeight: 700, borderRadius: 999 }}
                  />
                )}
              </Stack>

              <Typography
                variant="h2"
                sx={{
                  fontWeight: 800,
                  lineHeight: 0.98,
                  letterSpacing: "-0.05em",
                  maxWidth: 760,
                }}
              >
                Watch what’s trending, new, and ready to play.
              </Typography>

              <Typography
                sx={{
                  mt: 2,
                  maxWidth: 640,
                  color: "rgba(255,245,236,0.8)",
                  fontSize: { xs: 15, md: 18 },
                }}
              >
                Browse the public feed like a video platform homepage. Jump into uploads,
                follow creators, and keep exploring without friction.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  size="large"
                  component="a"
                  href="#video-feed"
                  sx={{
                    borderRadius: 999,
                    px: 3,
                    py: 1.2,
                    background: "#fff",
                    color: "#111",
                    "&:hover": { background: "#f2f2f2" },
                  }}
                >
                  Start Watching
                </Button>
                {!user && (
                  <Button
                    component={Link}
                    to="/register"
                    size="large"
                    sx={{
                      borderRadius: 999,
                      px: 3,
                      py: 1.2,
                      bgcolor: "rgba(255,255,255,0.09)",
                      color: "#fff",
                      "&:hover": { bgcolor: "rgba(255,255,255,0.16)" },
                    }}
                  >
                    Create Account
                  </Button>
                )}
                {user?.role === "ADMIN" && (
                  <Button
                    variant="outlined"
                    component={Link}
                    to="/admin"
                    sx={{
                      borderRadius: 999,
                      borderColor: "rgba(255,255,255,0.32)",
                      color: "#fff",
                    }}
                  >
                    Admin Panel
                  </Button>
                )}
              </Stack>
            </Box>

            <Stack
              spacing={1.5}
              sx={{
                minWidth: { lg: 280 },
                alignSelf: "center",
              }}
            >
              {[
                `${videos.length} videos in feed`,
                user ? `Signed in as ${user.role}` : "Guest browse enabled",
                "Creators, uploads, and streaming",
              ].map((item) => (
                <Box
                  key={item}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }}>{item}</Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Box>

        {!user && (
          <Alert
            severity="info"
            sx={{
              mb: 3,
              borderRadius: 2,
              bgcolor: "rgba(255,255,255,0.06)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            Guests can browse and watch videos for 30 minutes. Time left: {formatRemaining(guestRemainingMs)}.
            After that, login or registration is required.
          </Alert>
        )}

        <Divider sx={{ mb: 3, borderColor: "rgba(255,255,255,0.08)" }} />

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }} id="video-feed">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: "-0.03em" }}>
              Recommended Videos
            </Typography>
            <Typography sx={{ color: "rgba(255,255,255,0.58)" }}>
              A YouTube-style feed of ready-to-watch uploads from across the platform.
            </Typography>
          </Box>
        </Stack>

        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && videos.length === 0 && (
          <Typography color="text.secondary">No videos available yet.</Typography>
        )}

        {!loading && videos.length > 0 && (
          <Grid container spacing={2.5} alignItems="stretch">
            {videos.map((video) => (
              <Grid item key={video.id} xs={12} sm={6} md={4} lg={3}>
                <VideoCard video={video} />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
}

export default Dashboard;
