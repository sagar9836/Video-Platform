import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

function formatFileSize(file) {
  if (!file) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = file.size;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export default function VideoUpload() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState("idle");

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      size: formatFileSize(file),
      type: file.type || "video/*",
    };
  }, [file]);

  const upload = async () => {
    if (!title.trim() || !file) {
      setError("Title and video file are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      setStage("uploading");
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description);
      formData.append("file", file);

      const res = await api.post("/videos/upload-direct", formData);

      setStage("processing");
      setMessage(
        res.data?.detail ||
          "Upload submitted successfully. Your video is now being processed."
      );
      setTimeout(() => navigate("/creator"), 1500);
    } catch (err) {
      setError(err?.response?.data?.detail || "Upload failed");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  };

  const stageProgress =
    stage === "requesting" ? 20 : stage === "uploading" ? 65 : stage === "processing" ? 100 : 0;

  return (
    <Box
      sx={{
        maxWidth: 1180,
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
              "linear-gradient(135deg, rgba(14,14,14,0.98) 0%, rgba(24,24,24,0.95) 56%, rgba(56,18,18,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <Button
                onClick={() => navigate(-1)}
                sx={{
                  width: "fit-content",
                  px: 0,
                  color: "rgba(255,255,255,0.72)",
                }}
              >
                Back to Studio
              </Button>

              <Chip
                label="Video Upload"
                sx={{
                  width: "fit-content",
                  borderRadius: 999,
                  bgcolor: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              />

              <Typography variant="h3" fontWeight={800} sx={{ letterSpacing: "-0.05em", maxWidth: 620 }}>
                Publish your next upload with a creator-grade workflow.
              </Typography>

              <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 620 }}>
                Add strong metadata, upload your source file, and let the platform
                process it for playback. Clean titles and clear descriptions help
                viewers discover your content faster.
              </Typography>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.1)", my: 1 }} />

              <Stack spacing={1.4}>
                {[
                  "Use a clear title that explains the video instantly",
                  "Keep descriptions short, specific, and searchable",
                  "Upload your highest-quality source file",
                  "After upload, processing starts automatically",
                ].map((item) => (
                  <Box
                    key={item}
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderRadius: 3,
                      bgcolor: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <Typography fontWeight={600}>{item}</Typography>
                  </Box>
                ))}
              </Stack>

              {fileSummary && (
                <Box
                  sx={{
                    p: 2.2,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.56)", fontSize: 13 }}>
                    Selected file
                  </Typography>
                  <Typography fontWeight={800}>{fileSummary.name}</Typography>
                  <Typography sx={{ color: "rgba(255,255,255,0.68)", mt: 0.5 }}>
                    {fileSummary.size} • {fileSummary.type}
                  </Typography>
                </Box>
              )}
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
              <Box>
                <Typography variant="h5" fontWeight={800}>
                  Upload details
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.6)", mt: 0.7 }}>
                  Fill in your metadata and upload the source file for processing.
                </Typography>
              </Box>

              <TextField
                label="Video title"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={loading}
                InputProps={{
                  sx: {
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.04)",
                    color: "#fff",
                  },
                }}
                InputLabelProps={{ sx: { color: "rgba(255,255,255,0.56)" } }}
              />

              <TextField
                label="Description"
                multiline
                minRows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                InputProps={{
                  sx: {
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.04)",
                    color: "#fff",
                  },
                }}
                InputLabelProps={{ sx: { color: "rgba(255,255,255,0.56)" } }}
              />

              <Button
                component="label"
                variant="outlined"
                sx={{
                  justifyContent: "flex-start",
                  px: 2,
                  py: 1.4,
                  borderRadius: 3,
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.14)",
                }}
              >
                {file ? "Replace video file" : "Select video file"}
                <input
                  hidden
                  type="file"
                  accept="video/*"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Button>

              {loading && (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography fontWeight={700}>Upload progress</Typography>
                    <Typography sx={{ color: "rgba(255,255,255,0.6)" }}>
                      {stage === "requesting"
                        ? "Preparing upload"
                        : stage === "uploading"
                          ? "Uploading source"
                          : stage === "processing"
                            ? "Starting processing"
                            : "Idle"}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={stageProgress}
                    sx={{
                      height: 10,
                      borderRadius: 999,
                      bgcolor: "rgba(255,255,255,0.08)",
                      "& .MuiLinearProgress-bar": {
                        borderRadius: 999,
                        backgroundColor: "#ff0000",
                      },
                    }}
                  />
                </Box>
              )}

              {error && (
                <Alert
                  severity="error"
                  sx={{
                    borderRadius: 3,
                    bgcolor: "rgba(211,47,47,0.18)",
                    color: "#fff",
                  }}
                >
                  {error}
                </Alert>
              )}

              {message && (
                <Alert
                  severity="success"
                  sx={{
                    borderRadius: 3,
                    bgcolor: "rgba(46,125,50,0.18)",
                    color: "#fff",
                  }}
                >
                  {message}
                </Alert>
              )}

              <Button
                variant="contained"
                onClick={upload}
                disabled={loading}
                sx={{
                  py: 1.35,
                  borderRadius: 999,
                  fontWeight: 800,
                  bgcolor: "#ff0000",
                  "&:hover": { bgcolor: "#e00000" },
                }}
              >
                {loading ? <CircularProgress size={22} color="inherit" /> : "Upload Video"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
