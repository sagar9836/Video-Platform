import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";

import { useNavigate } from "react-router-dom";

export default function VideoCard({ video }) {
  const navigate = useNavigate();

  const status = String(video.status || "").toLowerCase();
  const isReady = status === "ready";
  const visibility = String(video.visibility || "PUBLIC").toLowerCase();
  const isPrivate = visibility === "private";

  const handleClick = () => {
    if (!isReady) return;
    navigate(`/video/${video.id}`);
  };

  return (
    <Card
      onClick={handleClick}
      sx={{
        width: "100%",
        cursor: isReady ? "pointer" : "default",
        bgcolor: "transparent",
        color: "#fff",
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid transparent",
        boxShadow: "none",
        transition: "transform 180ms ease, background-color 180ms ease",
        "&:hover": {
          transform: isReady ? "translateY(-2px)" : "none",
          backgroundColor: "rgba(255,255,255,0.03)",
        },
      }}
    >
      <Box sx={{ position: "relative" }}>
        <CardMedia
          component="img"
          image={
            video.thumbnail_url ||
            video.thumbnailUrl ||
            `https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?auto=format&fit=crop&w=1200&q=80`
          }
          alt={video.title}
          loading="lazy"
          sx={{
            aspectRatio: "16 / 9",
            objectFit: "cover",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.12) 52%, rgba(0,0,0,0.68) 100%)",
          }}
        />
        <Chip
          size="small"
          icon={isReady ? <PlayArrowIcon /> : <HourglassEmptyIcon />}
          label={isReady ? "Ready to watch" : "Processing"}
          sx={{
            position: "absolute",
            left: 14,
            bottom: 14,
            bgcolor: isReady ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.14)",
            color: "#fff",
            fontWeight: 700,
            backdropFilter: "blur(10px)",
          }}
        />
      </Box>

      <CardContent sx={{ p: 1.5 }}>
        <Stack spacing={1.2}>
          <Typography
            variant="subtitle1"
            fontWeight="bold"
            sx={{
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              minHeight: "2.8em",
            }}
          >
            {video.title}
          </Typography>

          <Typography sx={{ color: "rgba(255,255,255,0.58)", fontSize: 13 }}>
            {video.creatorName || "VideoPlatform creator"}
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              size="small"
              label={isReady ? "Watch" : "Preparing"}
              sx={{
                width: "fit-content",
                bgcolor: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
            <Chip
              size="small"
              label={isPrivate ? "Private" : "Public"}
              sx={{
                width: "fit-content",
                bgcolor: isPrivate ? "rgba(212, 127, 48, 0.16)" : "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.88)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
