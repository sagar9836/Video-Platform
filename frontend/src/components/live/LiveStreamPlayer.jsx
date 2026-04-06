import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

import { Alert, Box, CircularProgress } from "@mui/material";

export default function LiveStreamPlayer({ src, posterHeight = 420 }) {
  const videoRef = useRef(null);
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

    video.addEventListener("loadeddata", handleLoaded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    let hls;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
    } else if (Hls.isSupported()) {
      hls = new Hls({
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
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
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

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
          muted
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
