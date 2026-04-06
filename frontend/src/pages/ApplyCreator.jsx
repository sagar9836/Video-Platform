import { useMemo, useState } from "react";
import {
  requestCreatorVerification,
  confirmCreatorVerification,
} from "../api/creator.api";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

function StepChip({ active, done, label }) {
  return (
    <Chip
      label={label}
      sx={{
        borderRadius: 999,
        fontWeight: 700,
        color: "#fff",
        bgcolor: done
          ? "#ff0000"
          : active
            ? "rgba(255,255,255,0.16)"
            : "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    />
  );
}

export default function ApplyCreator() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState("request");
  const [pendingChannel, setPendingChannel] = useState("");

  const channelHandle = useMemo(() => {
    return channelName.trim().toLowerCase().replace(/\s+/g, "-");
  }, [channelName]);

  if (!user) {
    return (
      <Typography align="center" sx={{ mt: 6 }}>
        Please login to become a creator.
      </Typography>
    );
  }

  if (user.role === "CREATOR") {
    return (
      <Box
        sx={{
          maxWidth: 720,
          mx: "auto",
          mt: 6,
          px: 2,
        }}
      >
        <Card
          sx={{
            borderRadius: 5,
            bgcolor: "rgba(15,15,15,0.96)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Stack spacing={2}>
              <Chip
                label="Creator Activated"
                sx={{
                  width: "fit-content",
                  borderRadius: 999,
                  bgcolor: "#ff0000",
                  color: "#fff",
                  fontWeight: 800,
                }}
              />
              <Typography variant="h4" fontWeight={800} sx={{ letterSpacing: "-0.03em" }}>
                Your creator workspace is ready.
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.68)", maxWidth: 560 }}>
                You already have creator access. Open the studio to upload videos,
                manage your channel, and go live.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/creator")}
                sx={{
                  width: "fit-content",
                  px: 3,
                  py: 1.2,
                  borderRadius: 999,
                  bgcolor: "#ff0000",
                }}
              >
                Go to Creator Studio
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  const handleRequestCode = async () => {
    if (!channelName.trim()) {
      setError("Channel name is required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await requestCreatorVerification({
        channel_name: channelName.trim(),
        description,
      });
      setPendingChannel(data.channel_name || channelName.trim());
      setStep("confirm");
      setSuccess(
        "A verification code was sent to your email. Enter it below to activate your creator channel."
      );
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Failed to send verification code"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!code.trim()) {
      setError("Verification code is required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await confirmCreatorVerification({ code: code.trim() });
      if (data.access_token) {
        localStorage.setItem("token", data.access_token);
        await refreshUser();
      }

      setSuccess("Your creator channel is active now.");
      navigate("/creator");
    } catch (err) {
      setError(
        err?.response?.data?.detail || "Failed to verify creator channel"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        maxWidth: 1160,
        mx: "auto",
        mt: 4,
        px: { xs: 2, md: 3 },
        pb: 5,
      }}
    >
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={3}
        alignItems="stretch"
      >
        <Card
          sx={{
            flex: 1.2,
            borderRadius: 5,
            overflow: "hidden",
            color: "#fff",
            background:
              "linear-gradient(135deg, rgba(11,11,11,0.98) 0%, rgba(36,14,14,0.95) 52%, rgba(111,22,22,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Stack spacing={2}>
              <Chip
                label="Creator Onboarding"
                sx={{
                  width: "fit-content",
                  borderRadius: 999,
                  bgcolor: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  fontWeight: 800,
                }}
              />

              <Typography variant="h3" fontWeight={800} sx={{ letterSpacing: "-0.05em", maxWidth: 620 }}>
                Launch your channel and start building your audience.
              </Typography>

              <Typography sx={{ color: "rgba(255,255,255,0.72)", maxWidth: 620 }}>
                Create your creator identity in minutes. Choose your channel name,
                verify your email, and unlock uploads, streaming, analytics, and subscribers.
              </Typography>

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 1 }}>
                <StepChip label="1. Channel setup" active={step === "request"} done={step === "confirm"} />
                <StepChip label="2. Email verify" active={step === "confirm"} done={false} />
                <StepChip label="3. Start creating" active={false} done={false} />
              </Stack>

              <Divider sx={{ borderColor: "rgba(255,255,255,0.1)", my: 1 }} />

              <Stack spacing={1.4}>
                {[
                  "Upload videos and publish your first content",
                  "Go live with OBS and your stream key",
                  "Track views, watch activity, and subscriber growth",
                  "Build a public channel viewers can revisit",
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

              {channelHandle && step === "request" && (
                <Box
                  sx={{
                    mt: 1,
                    p: 2,
                    borderRadius: 3,
                    bgcolor: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Typography sx={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                    Preview handle
                  </Typography>
                  <Typography fontWeight={800}>@{channelHandle}</Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card
          sx={{
            flex: 0.9,
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
                  {step === "request" ? "Create your channel" : "Verify your email"}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.6)", mt: 0.7 }}>
                  {step === "request"
                    ? "Pick a strong channel identity and request your verification code."
                    : `We sent a code for ${pendingChannel || channelName}. Enter it to activate creator access.`}
                </Typography>
              </Box>

              {step === "request" && (
                <Stack spacing={2}>
                  <TextField
                    label="Channel name"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    disabled={loading}
                    fullWidth
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
                    label="Channel description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={loading}
                    fullWidth
                    multiline
                    minRows={4}
                    InputProps={{
                      sx: {
                        borderRadius: 3,
                        bgcolor: "rgba(255,255,255,0.04)",
                        color: "#fff",
                      },
                    }}
                    InputLabelProps={{ sx: { color: "rgba(255,255,255,0.56)" } }}
                  />
                </Stack>
              )}

              {step === "confirm" && (
                <Stack spacing={2}>
                  <TextField
                    label={`Verification code for ${pendingChannel || channelName}`}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={loading}
                    fullWidth
                    InputProps={{
                      sx: {
                        borderRadius: 3,
                        bgcolor: "rgba(255,255,255,0.04)",
                        color: "#fff",
                        letterSpacing: "0.2em",
                        fontWeight: 700,
                      },
                    }}
                    InputLabelProps={{ sx: { color: "rgba(255,255,255,0.56)" } }}
                  />

                  <Button
                    variant="text"
                    onClick={() => {
                      setStep("request");
                      setCode("");
                      setError("");
                      setSuccess("");
                    }}
                    sx={{
                      width: "fit-content",
                      px: 0,
                      color: "rgba(255,255,255,0.72)",
                    }}
                  >
                    Edit channel details
                  </Button>
                </Stack>
              )}

              {success && (
                <Alert
                  severity="success"
                  sx={{
                    borderRadius: 3,
                    bgcolor: "rgba(46,125,50,0.18)",
                    color: "#fff",
                  }}
                >
                  {success}
                </Alert>
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

              <Button
                variant="contained"
                fullWidth
                disabled={loading}
                onClick={step === "request" ? handleRequestCode : handleConfirmCode}
                sx={{
                  py: 1.35,
                  borderRadius: 999,
                  fontWeight: 800,
                  bgcolor: "#ff0000",
                  "&:hover": { bgcolor: "#e00000" },
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  step === "request"
                    ? "Send Verification Code"
                    : "Verify and Activate Channel"
                )}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
