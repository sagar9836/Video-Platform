import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import { completeUpload, createVideoUpload, uploadVideo, videoStatus } from "../../api/video.api";

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
  const [uploadPercent, setUploadPercent] = useState(0);
  const [processingVideoId, setProcessingVideoId] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null);

  // Poll processing status
  useEffect(() => {
    if (!processingVideoId) return;

    const pollStatus = async () => {
      try {
        const status = await videoStatus({ video_id: processingVideoId });
        setProcessingStatus(status);

        if (status.status === "READY") {
          setMessage("Video processing complete! Your video is now ready to watch.");
          setTimeout(() => navigate("/creator"), 2000);
        } else if (status.status === "FAILED") {
          setError(`Processing failed: ${status.error || "Unknown error"}`);
          setStage("idle");
          setProcessingVideoId(null);
        }
      } catch (err) {
        console.error("Status polling error:", err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [processingVideoId, navigate]);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      size: formatFileSize(file),
      type: file.type || "video/*",
    };
  }, [file]);

  const buildUploadErrorMessage = (err, fallbackMessage) => {
    if (err?.response?.data?.detail) {
      return err.response.data.detail;
    }

    if (err?.message) {
      return err.message;
    }

    return fallbackMessage;
  };

  const uploadViaBackendFallback = async ({ videoId }) => {
    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("description", description);
    formData.append("file", file);
    if (videoId) {
      formData.append("video_id", String(videoId));
    }

    setStage("uploading");
    setMessage("Direct upload fallback is running because browser-to-S3 upload is blocked.");
    setUploadPercent(20);

    return uploadVideo(formData);
  };

  const upload = async () => {
    if (!title.trim() || !file) {
      setError("Title and video file are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      setUploadPercent(0);

      setStage("requesting");
      const uploadSession = await createVideoUpload({
        title: title.trim(),
        description,
      });

      try {
        setStage("uploading");
        await axios.put(uploadSession.upload_url, file, {
          timeout: 30 * 60 * 1000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          onUploadProgress: (progressEvent) => {
            if (!progressEvent.total) {
              return;
            }

            setUploadPercent(
              Math.max(
                5,
                Math.min(95, Math.round((progressEvent.loaded / progressEvent.total) * 100))
              )
            );
          },
        });
      } catch {
        const fallbackResponse = await uploadViaBackendFallback({
          videoId: uploadSession.video_id,
        });
        setStage("processing");
        setUploadPercent(100);
        setMessage(
          fallbackResponse?.detail ||
            "Browser upload to S3 was blocked, so the app used the server upload path instead."
        );
        setTimeout(() => navigate("/creator"), 1500);
        return;
      }

      let res;
      try {
        setStage("processing");
        setUploadPercent(100);
        res = await completeUpload({ video_id: uploadSession.video_id });
        setProcessingVideoId(uploadSession.video_id);
        setMessage("Upload complete! Processing your video...");
      } catch (err) {
        throw new Error(
          buildUploadErrorMessage(
            err,
            "The file uploaded, but processing could not be started. Please retry in a moment."
          )
        );
      }

      setMessage(
        res?.detail ||
          "Upload submitted successfully. Your video is now being processed."
      );
      setTimeout(() => navigate("/creator"), 1500);
    } catch (err) {
      setError(err?.message || err?.response?.data?.detail || "Upload failed");
      setStage("idle");
      setUploadPercent(0);
    } finally {
      setLoading(false);
    }
  };

  const stageProgress =
    stage === "requesting"
      ? 15
      : stage === "uploading"
        ? uploadPercent
        : stage === "processing"
          ? 100
          : 0;

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
                  "A thumbnail is generated automatically during processing",
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
                          ? `Uploading source${uploadPercent ? ` (${uploadPercent}%)` : ""}`
                          : stage === "processing" && processingVideoId
                            ? `Processing: ${processingStatus?.status || "Checking..."}`
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

              {processingVideoId && processingStatus && processingStatus.status !== "READY" && (
                <Alert
                  severity="info"
                  sx={{
                    borderRadius: 3,
                    bgcolor: "rgba(33,150,243,0.18)",
                    color: "#fff",
                  }}
                >
                  <Stack spacing={1}>
                    <Typography fontWeight={600}>
                      Processing Status: {processingStatus.status}
                    </Typography>
                    {processingStatus.error && (
                      <Typography variant="body2" sx={{ opacity: 0.8 }}>
                        Error: {processingStatus.error}
                      </Typography>
                    )}
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      Checking status every 3 seconds...
                    </Typography>
                  </Stack>
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
