import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import {
  completeUpload,
  createVideoUpload,
  uploadVideo,
  videoStatus,
} from "../../api/video.api";

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
  const [visibility, setVisibility] = useState("PUBLIC");
  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [stage, setStage] = useState("idle");
  const [uploadPercent, setUploadPercent] = useState(0);

  const [videoId, setVideoId] = useState(null);
  const [processingStatus, setProcessingStatus] = useState(null);

  // 🔄 Poll processing status
  useEffect(() => {
    if (!videoId) return;

    const poll = async () => {
      try {
        const res = await videoStatus({ video_id: videoId });
        setProcessingStatus(res);

        if (res.status === "READY") {
          setMessage("🎉 Video is ready!");
          setTimeout(() => navigate("/creator"), 2000);
        }

        if (res.status === "FAILED") {
          setError(res.error || "Processing failed");
          setStage("idle");
          setVideoId(null);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [videoId, navigate]);

  const fileSummary = useMemo(() => {
    if (!file) return null;
    return {
      name: file.name,
      size: formatFileSize(file),
      type: file.type || "video/*",
    };
  }, [file]);

  // 🚀 MAIN UPLOAD FLOW
  const handleUpload = async () => {
    if (!title.trim() || !file) {
      setError("Title and video file are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      setUploadPercent(0);

      // 🟢 STEP 1: Create upload session
      setStage("requesting");
      const { video_id, upload_url, storage_backend } = await createVideoUpload({
        title: title.trim(),
        description,
        visibility,
      });

      setVideoId(video_id);

      // 🟡 STEP 2: Upload to storage
      setStage("uploading");

      if (storage_backend === "local") {
        const formData = new FormData();
        formData.append("title", title);
        formData.append("description", description);
        formData.append("file", file);
        formData.append("video_id", video_id);
        formData.append("visibility", visibility);

        await uploadVideo(formData, {
          onUploadProgress: (e) => {
            if (!e.total) return;
            const percent = Math.round((e.loaded * 100) / e.total);
            setUploadPercent(percent);
          },
        });

        setStage("processing");
        setMessage("Upload complete. Processing started...");
        return;
      }

      let usedDirectUpload = false;
      try {
        await axios.put(upload_url, file, {
          headers: { "Content-Type": file.type },
          onUploadProgress: (e) => {
            if (!e.total) return;
            const percent = Math.round((e.loaded * 100) / e.total);
            setUploadPercent(percent);
          },
        });
      } catch (err) {
        // 🔥 FALLBACK: backend upload
        const formData = new FormData();
        formData.append("title", title);
        formData.append("description", description);
        formData.append("file", file);
        formData.append("video_id", video_id);
        formData.append("visibility", visibility);

        await uploadVideo(formData);
        usedDirectUpload = true;

        setMessage("Fallback upload used");
      }

      // 🔴 STEP 3: COMPLETE
      setStage("processing");
      if (!usedDirectUpload) {
        await completeUpload({ video_id });
      }

      setMessage("Upload complete. Processing started...");
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.detail || err.message || "Upload failed"
      );
      setStage("idle");
      setUploadPercent(0);
    } finally {
      setLoading(false);
    }
  };

  const progressValue =
    stage === "requesting"
      ? 10
      : stage === "uploading"
      ? uploadPercent
      : stage === "processing"
      ? 100
      : 0;

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", mt: 4 }}>
      <Card sx={{ borderRadius: 4 }}>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h5">Upload Video</Typography>

            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
            />

            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
            />

            <TextField
              select
              fullWidth
              label="Visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              SelectProps={{ native: true }}
            >
              <option value="PUBLIC">Public</option>
              <option value="PRIVATE">Private</option>
            </TextField>

            <Button component="label" variant="outlined">
              {file ? "Change File" : "Select Video"}
              <input
                hidden
                type="file"
                accept="video/*"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </Button>

            {fileSummary && (
              <Chip
                label={`${fileSummary.name} • ${fileSummary.size}`}
              />
            )}

            {loading && (
              <LinearProgress
                variant="determinate"
                value={progressValue}
              />
            )}

            {processingStatus && (
              <Alert severity="info">
                Status: {processingStatus.status}
              </Alert>
            )}

            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}

            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={loading}
            >
              {loading ? <CircularProgress size={20} /> : "Upload"}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
