import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from "@mui/material";

import LiveTvRoundedIcon from "@mui/icons-material/LiveTvRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";

import { getSubscribedChannels } from "../api/subscription.api";
import { fetchMyNotifications } from "../api/user.api";

export default function SubscriptionsPage() {
  const [channels, setChannels] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [channelData, notificationData] = await Promise.all([
          getSubscribedChannels(),
          fetchMyNotifications(),
        ]);

        if (!mounted) return;

        setChannels(Array.isArray(channelData) ? channelData : []);
        setNotifications(notificationData?.notifications || []);
        setError("");
      } catch (err) {
        if (!mounted) return;
        setError("Unable to load your subscribed channels right now.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    const timer = window.setInterval(load, 20000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const liveChannels = useMemo(
    () => channels.filter((channel) => channel.is_live),
    [channels]
  );

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 4 } }}>
      <Stack spacing={3} sx={{ maxWidth: 1280, mx: "auto" }}>
        <Box
          sx={{
            p: { xs: 3, md: 4 },
            borderRadius: 5,
            color: "#fff6ef",
            background:
              "linear-gradient(135deg, rgba(14,13,19,0.96) 0%, rgba(77,18,25,0.95) 52%, rgba(201,70,52,0.92) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 28px 70px rgba(0,0,0,0.28)",
          }}
        >
          <Stack direction={{ xs: "column", lg: "row" }} spacing={3} justifyContent="space-between">
            <Box sx={{ maxWidth: 760 }}>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
                <Chip
                  icon={<SubscriptionsRoundedIcon sx={{ color: "inherit !important" }} />}
                  label={`${channels.length} followed channels`}
                  sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "#fff" }}
                />
                <Chip
                  icon={<LiveTvRoundedIcon sx={{ color: "inherit !important" }} />}
                  label={`${liveChannels.length} live right now`}
                  sx={{ bgcolor: "rgba(255, 0, 51, 0.18)", color: "#fff" }}
                />
              </Stack>

              <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: "-0.04em" }}>
                Your subscribed channels, with live join shortcuts.
              </Typography>
              <Typography sx={{ mt: 1.5, color: "rgba(255,246,239,0.82)", maxWidth: 680 }}>
                Keep track of the creators you follow, see who is live, and jump straight
                into the stream from one clean subscription view.
              </Typography>
            </Box>

            <Card
              sx={{
                minWidth: { lg: 320 },
                bgcolor: "rgba(255,255,255,0.10)",
                borderRadius: 4,
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#fff",
              }}
            >
              <CardContent>
                <Stack spacing={1.2}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <NotificationsActiveRoundedIcon />
                    <Typography fontWeight={800}>Latest alerts</Typography>
                  </Stack>
                  {notifications.slice(0, 3).map((notification, index) => (
                    <Box
                      key={`${notification.created_at || "alert"}-${index}`}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        bgcolor: "rgba(0,0,0,0.18)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <Typography fontWeight={700}>
                        {notification.title || notification.channel_name || "Channel update"}
                      </Typography>
                      <Typography sx={{ mt: 0.5, color: "rgba(255,255,255,0.76)" }}>
                        {notification.message}
                      </Typography>
                    </Box>
                  ))}
                  {notifications.length === 0 && (
                    <Typography sx={{ color: "rgba(255,255,255,0.72)" }}>
                      New uploads and live starts will appear here.
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
            <CircularProgress />
          </Box>
        ) : channels.length === 0 ? (
          <Card
            sx={{
              borderRadius: 5,
              bgcolor: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          >
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h5" fontWeight={800}>
                No subscriptions yet
              </Typography>
              <Typography sx={{ mt: 1, color: "rgba(255,255,255,0.66)" }}>
                Open creator channels from the home feed and subscribe to start building
                your live list.
              </Typography>
              <Button component={Link} to="/" variant="contained" sx={{ mt: 3, borderRadius: 999 }}>
                Explore videos
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {channels.map((channel) => (
              <Grid item xs={12} md={6} xl={4} key={channel.creator_id}>
                <Card
                  sx={{
                    height: "100%",
                    borderRadius: 5,
                    bgcolor: "rgba(255,255,255,0.04)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Box>
                          <Typography variant="h5" fontWeight={800}>
                            {channel.channel_name}
                          </Typography>
                          <Typography sx={{ mt: 0.75, color: "rgba(255,255,255,0.62)" }}>
                            {channel.description || "Subscribed creator channel"}
                          </Typography>
                        </Box>
                        <Chip
                          label={channel.is_live ? "Live now" : "Offline"}
                          color={channel.is_live ? "error" : "default"}
                          sx={{
                            color: "#fff",
                            bgcolor: channel.is_live
                              ? "rgba(255, 0, 51, 0.18)"
                              : "rgba(255,255,255,0.08)",
                          }}
                        />
                      </Stack>

                      <Typography sx={{ color: "rgba(255,255,255,0.58)" }}>
                        {channel.subscribers_count || 0} subscribers
                      </Typography>

                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2}>
                        <Button
                          component={Link}
                          to={channel.channel_url || `/channel/${channel.creator_id}`}
                          variant="outlined"
                          sx={{
                            borderRadius: 999,
                            borderColor: "rgba(255,255,255,0.18)",
                            color: "#fff",
                          }}
                        >
                          Open channel
                        </Button>
                        <Button
                          component={Link}
                          to={channel.live_url || `/live/${channel.creator_id}`}
                          variant="contained"
                          startIcon={<LiveTvRoundedIcon />}
                          disabled={!channel.is_live}
                          sx={{
                            borderRadius: 999,
                            bgcolor: channel.is_live ? "#ff0033" : "rgba(255,255,255,0.08)",
                            color: "#fff",
                          }}
                        >
                          {channel.is_live ? "Join live" : "Waiting for live"}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Stack>
    </Box>
  );
}
