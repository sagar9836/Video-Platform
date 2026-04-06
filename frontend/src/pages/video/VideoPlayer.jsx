import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Hls from "hls.js";

import { fetchVideoPageGraphql } from "../../api/graphql.api";
import CommentsSection from "../../components/common/CommentsSection";

import {
  registerView,
  registerWatch,
  likeVideo,
  getVideoStats,
} from "../../api/analytics.api";

import {
  subscribeCreator,
  unSubscribe,
} from "../../api/subscription.api";

import { useAuth } from "../../auth/AuthContext";
import { getGuestSessionRemainingMs } from "../../auth/guestSession";

import {
  Box,
  Typography,
  Avatar,
  Button,
  Stack,
  Divider,
  CircularProgress,
  Alert,
} from "@mui/material";

import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";

export default function VideoPlayer() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const videoRef = useRef(null);
  const watchStartRef = useRef(null);

  const [videoUrl, setVideoUrl] = useState(null);
  const [video, setVideo] = useState(null);
  const [creator, setCreator] = useState(null);

  const [stats, setStats] = useState({
    views: 0,
    likes: 0,
    liked: false,
  });

  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [likeLoading, setLikeLoading] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [guestPreviewLimit, setGuestPreviewLimit] = useState(null);
  const [previewLocked, setPreviewLocked] = useState(false);
  const [guestSessionExpired, setGuestSessionExpired] = useState(false);

  useEffect(() => {
    if (videoId) {
      registerView(videoId).catch(() => {});
    }
  }, [videoId]);

  useEffect(() => {
    if (user) return;

    const syncGuestSession = () => {
      const expired = getGuestSessionRemainingMs() <= 0;
      setGuestSessionExpired(expired);
      if (expired && videoRef.current) {
        videoRef.current.pause();
      }
    };

    syncGuestSession();
    const timer = window.setInterval(syncGuestSession, 1000);
    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoUrl) return undefined;

    let hls;

    if (videoEl.canPlayType("application/vnd.apple.mpegurl")) {
      videoEl.src = videoUrl;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(videoUrl);
      hls.attachMedia(videoEl);
    } else {
      videoEl.src = videoUrl;
    }

    return () => {
      if (hls) hls.destroy();
    };
  }, [videoUrl]);

  const loadVideoPage = async () => {
    const data = await fetchVideoPageGraphql(videoId);

    setVideoUrl(data?.playback?.hlsUrl || null);
    setGuestPreviewLimit(
      data?.playback?.guestMode ? data?.playback?.allowedFraction ?? 0.25 : null
    );
    setPreviewLocked(false);
    setVideo({
      id: data.id,
      title: data.title,
      description: data.description,
      creator: data.creator,
    });
    setCreator(data.creator || null);
    setStats({
      views: data?.stats?.views ?? 0,
      likes: data?.stats?.likes ?? 0,
      liked: data?.stats?.liked ?? false,
    });
    setSubscribed(Boolean(data?.isSubscribed));
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await loadVideoPage();
      } catch (err) {
        console.error("Failed to load video", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [videoId, user]);

  const handlePlay = () => {
    watchStartRef.current = Date.now();
  };

  const handlePauseOrEnd = () => {
    if (!watchStartRef.current) return;

    const seconds = (Date.now() - watchStartRef.current) / 1000;

    if (seconds >= 5) {
      registerWatch(videoId).catch(() => {});
    }

    watchStartRef.current = null;
  };

  const handleLike = async () => {
    if (!user || stats.liked || likeLoading) return;

    try {
      setLikeLoading(true);
      await likeVideo(videoId);
      const updated = await getVideoStats(videoId);
      setStats((prev) => ({
        ...prev,
        views: updated.views,
        likes: updated.likes,
        liked: true,
      }));
    } finally {
      setLikeLoading(false);
    }
  };

  const toggleSubscribe = async () => {
    if (!user || !creator || subLoading) return;

    try {
      setSubLoading(true);

      if (subscribed) {
        await unSubscribe(creator.id);
        setSubscribed(false);
      } else {
        await subscribeCreator(creator.id);
        setSubscribed(true);
      }
    } finally {
      setSubLoading(false);
    }
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;

    if (!el || user || guestPreviewLimit == null) return;
    if (!el.duration || Number.isNaN(el.duration)) return;

    const maxAllowed = el.duration * guestPreviewLimit;
    if (el.currentTime >= maxAllowed) {
      el.pause();
      el.currentTime = maxAllowed;
      setPreviewLocked(true);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (guestSessionExpired && !user) {
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", mt: 8, px: 2 }}>
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => navigate("/login")}>
                Login
              </Button>
              <Button color="inherit" size="small" onClick={() => navigate("/register")}>
                Register
              </Button>
            </Stack>
          }
        >
          Your 30-minute guest access has ended. Please login or register to continue watching videos.
        </Alert>
      </Box>
    );
  }

  if (!videoUrl) {
    return (
      <Typography align="center" sx={{ mt: 6 }}>
        Video not available
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        maxWidth: 1180,
        mx: "auto",
        mt: 3,
        px: 2,
        pb: 5,
      }}
    >
      <Box
        sx={{
          backgroundColor: "#000",
          borderRadius: 4,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.36)",
        }}
      >
        <video
          ref={videoRef}
          controls
          width="100%"
          onPlay={handlePlay}
          onPause={handlePauseOrEnd}
          onEnded={handlePauseOrEnd}
          onTimeUpdate={handleTimeUpdate}
        />
      </Box>

      {previewLocked && !user && (
        <Alert
          severity="info"
          sx={{
            mt: 2,
            borderRadius: 3,
            bgcolor: "rgba(255,255,255,0.06)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate("/login")}>
              Login / Signup
            </Button>
          }
        >
          You have reached the free preview limit (25%). Please login/signup to continue watching.
        </Alert>
      )}

      <Typography variant="h4" fontWeight="bold" mt={2.5} sx={{ letterSpacing: "-0.03em" }}>
        {video?.title}
      </Typography>

      <Typography color="text.secondary" sx={{ color: "rgba(255,255,255,0.56)" }}>
        {stats.views} views
      </Typography>

      {creator && (
        <Stack
          direction={{ xs: "column", md: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", md: "center" }}
          mt={2.5}
          spacing={2}
          sx={{
            p: 2.5,
            borderRadius: 4,
            bgcolor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ bgcolor: "#2a1a1b", color: "#f5b95a", fontWeight: 800 }}>
              {creator.channelName?.[0]?.toUpperCase() || "C"}
            </Avatar>

            <Box sx={{ cursor: "pointer" }} onClick={() => navigate(`/channel/${creator.id}`)}>
              <Typography fontWeight="bold" sx={{ fontSize: 18 }}>
                {creator.channelName}
              </Typography>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.56)" }}>
                {creator.subscribersCount ?? 0} subscribers
              </Typography>
            </Box>

            {user && (
              <Button
                variant={subscribed ? "outlined" : "contained"}
                color="error"
                onClick={toggleSubscribe}
                disabled={subLoading}
                sx={{
                  borderRadius: 999,
                  px: 2.2,
                  bgcolor: subscribed ? "transparent" : "#fff",
                  color: subscribed ? "#fff" : "#111",
                  borderColor: "rgba(255,255,255,0.22)",
                }}
              >
                {subscribed ? "Subscribed" : "Subscribe"}
              </Button>
            )}
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<ThumbUpOutlinedIcon />}
              onClick={handleLike}
              disabled={!user || stats.liked || likeLoading}
              sx={{
                borderRadius: 999,
                bgcolor: "rgba(255,255,255,0.06)",
                color: "#fff",
                px: 2,
              }}
            >
              {stats.likes}
            </Button>

            <Button
              startIcon={<ShareOutlinedIcon />}
              sx={{
                borderRadius: 999,
                bgcolor: "rgba(255,255,255,0.06)",
                color: "#fff",
                px: 2,
              }}
            >
              Share
            </Button>
          </Stack>
        </Stack>
      )}

      <Divider sx={{ my: 3, borderColor: "rgba(255,255,255,0.08)" }} />

      <Box
        sx={{
          p: 2.5,
          borderRadius: 4,
          bgcolor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Typography sx={{ color: "rgba(255,255,255,0.8)", lineHeight: 1.7 }}>
          {video?.description || "No description available."}
        </Typography>
      </Box>

      <Divider sx={{ my: 3, borderColor: "rgba(255,255,255,0.08)" }} />

      <CommentsSection videoId={videoId} />
    </Box>
  );
}
