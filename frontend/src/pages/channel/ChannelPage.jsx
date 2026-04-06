import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Alert, Box, Button, Chip, Grid, Stack, Typography } from "@mui/material";

import VideoCard from "../../components/common/VideoCard";
import { fetchChannelPageGraphql } from "../../api/graphql.api";
import {
  subscribeCreator,
  unSubscribe,
} from "../../api/subscription.api";
import { useAuth } from "../../auth/AuthContext";

export default function ChannelPage() {
  const { creatorId } = useParams();
  const { user } = useAuth();

  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await fetchChannelPageGraphql(creatorId);
        if (!mounted) {
          return;
        }

        setChannel(data.channel);
        setVideos(data.videos);
        setIsLive(Boolean(data.isLive));
        setIsSubscribed(Boolean(data.isSubscribed));
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError("Failed to load channel page.");
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
  }, [creatorId, user]);

  const handleSubscribe = async () => {
    if (!user) {
      alert("Please login to subscribe");
      return;
    }

    try {
      if (isSubscribed) {
        await unSubscribe(creatorId);
        setIsSubscribed(false);
      } else {
        await subscribeCreator(creatorId);
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error("Subscription failed", err);
    }
  };

  if (loading) {
    return <Typography sx={{ p: 4 }}>Loading channel...</Typography>;
  }

  if (!channel) {
    return <Typography sx={{ p: 4 }}>Channel not found</Typography>;
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: { xs: 2, md: 4 },
        py: 4,
        background: "linear-gradient(180deg, #0f0f0f 0%, #111111 100%)",
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }}>
        {error && <Alert severity="error">{error}</Alert>}

        <Box
          sx={{
            borderRadius: 4,
            p: { xs: 3, md: 4 },
            color: "#fff",
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.95) 0%, rgba(34,34,34,0.92) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={3}
          >
            <Box sx={{ maxWidth: 760 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  label={isLive ? "Live Now" : "Channel"}
                  sx={{
                    bgcolor: isLive ? "#ff0000" : "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontWeight: 700,
                    borderRadius: 999,
                  }}
                />
                <Typography sx={{ opacity: 0.82 }}>
                  {channel.subscribersCount ?? 0} subscribers
                </Typography>
              </Stack>

              <Typography variant="h3" fontWeight={800} sx={{ mt: 1.5, letterSpacing: "-0.03em" }}>
                {channel.channelName}
              </Typography>

              {channel.description && (
                <Typography sx={{ mt: 1.5, color: "rgba(255,247,239,0.86)", maxWidth: 660 }}>
                  {channel.description}
                </Typography>
              )}
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              {isLive && (
                <Button
                  component={Link}
                  to={`/live/${creatorId}`}
                  variant="contained"
                  sx={{ bgcolor: "#ff0000", borderRadius: 999 }}
                >
                  Watch Live
                </Button>
              )}

              <Button
                variant={isSubscribed ? "outlined" : "contained"}
                onClick={handleSubscribe}
                sx={{
                  color: isSubscribed ? "#fff" : "#111",
                  bgcolor: isSubscribed ? "transparent" : "#fff",
                  borderColor: "rgba(255,255,255,0.35)",
                  borderRadius: 999,
                }}
              >
                {isSubscribed ? "Subscribed" : "Subscribe"}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Box>
          <Typography variant="h5" fontWeight={800} gutterBottom>
            Videos
          </Typography>

          <Grid container spacing={3}>
            {videos.length === 0 ? (
              <Typography sx={{ px: 2, color: "text.secondary" }}>
                No videos uploaded yet.
              </Typography>
            ) : (
              videos.map((video) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={video.id}>
                  <VideoCard video={video} />
                </Grid>
              ))
            )}
          </Grid>
        </Box>
      </Stack>
    </Box>
  );
}
