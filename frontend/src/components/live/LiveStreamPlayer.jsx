import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

import { Alert, Box, CircularProgress } from "@mui/material";

export default function LiveStreamPlayer({
  src,
  posterHeight = 420,
  muted = true,
  initialOffsetSeconds = 0,
}) {
  const videoRef = useRef(null);
  const appliedSourceRef = useRef("");
  const [playerError, setPlayerError] = useState("");
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) {
      return undefined;
    }

    setPlayerError("");
    setIsBuffering(true);

    const handleLoaded = () => setIsBuffering(false);
    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const startPlayback = async () => {
      try {
        await video.play();
      } catch {
        if (!video.muted) {
          video.muted = true;
          try {
            await video.play();
          } catch {
            // Ignore autoplay failures until the user interacts.
          }
        }
      }
    };
    const applyInitialOffset = () => {
      if (appliedSourceRef.current === src) {
        return;
      }

      appliedSourceRef.current = src;
      if (!initialOffsetSeconds || Number.isNaN(initialOffsetSeconds)) {
        return;
      }

      try {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.min(initialOffsetSeconds, Math.max(video.duration - 1, 0));
        } else {
          video.currentTime = initialOffsetSeconds;
        }
      } catch {
        // Ignore seek failures for still-loading media.
      }
    };

    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("loadedmetadata", applyInitialOffset);

    let hls;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.muted = muted;
      video.src = src;
      startPlayback();
    } else if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.muted = muted;
        startPlayback();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data?.fatal) {
          setPlayerError("Live stream failed to load. Please try again.");
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else {
            hls.destroy();
          }
        }
      });
    } else {
      setPlayerError("This browser does not support HLS playback.");
    }

    return () => {
      video.pause();
      video.removeEventListener("loadeddata", handleLoaded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("loadedmetadata", applyInitialOffset);
      if (hls) {
        hls.destroy();
      }
    };
  }, [src, muted]);

  return (
    <Box>
      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 4,
          border: "1px solid rgba(18, 18, 18, 0.08)",
          background:
            "radial-gradient(circle at top, rgba(196, 37, 74, 0.28), transparent 45%), #080808",
          minHeight: posterHeight,
        }}
      >
        <video
          ref={videoRef}
          controls
          playsInline
          muted={muted}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            background: "#080808",
          }}
        />

        {isBuffering && !playerError && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, rgba(8,8,8,0.2), rgba(8,8,8,0.55))",
            }}
          >
            <CircularProgress sx={{ color: "#fff7ef" }} />
          </Box>
        )}
      </Box>

      {playerError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {playerError}
        </Alert>
      )}
    </Box>
  );
}
