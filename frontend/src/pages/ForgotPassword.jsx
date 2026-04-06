import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../api/auth.api";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);

  const handleRequestCode = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    try {
      setRequestLoading(true);
      setError("");
      setMessage("");

      const data = await requestPasswordReset({ email: email.trim() });
      setMessage(data?.detail || "If the account exists, a reset code has been sent.");
      setCodeRequested(true);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to send reset code");
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    if (!email.trim() || !code.trim() || !newPassword) {
      setError("Email, verification code, and new password are required");
      return;
    }

    try {
      setResetLoading(true);
      setError("");
      setMessage("");

      const data = await confirmPasswordReset({
        email: email.trim(),
        code: code.trim(),
        new_password: newPassword,
      });

      setMessage(data?.detail || "Password reset successful");
      setTimeout(() => navigate("/login"), 1400);
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to reset password");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        background:
          "radial-gradient(circle at top left, rgba(229,9,20,0.24), transparent 22%), radial-gradient(circle at top right, rgba(245,185,90,0.18), transparent 20%), linear-gradient(180deg, #0c0a0c 0%, #131012 100%)",
      }}
    >
      <Card
        sx={{
          maxWidth: 520,
          width: "100%",
          borderRadius: 6,
          bgcolor: "rgba(18,16,18,0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.4)",
          backdropFilter: "blur(18px)",
        }}
      >
        <CardContent sx={{ p: 4.5 }}>
          <Typography variant="overline" sx={{ color: "#f5b95a", letterSpacing: "0.18em" }}>
            ACCOUNT RECOVERY
          </Typography>
          <Typography variant="h4" fontWeight="bold" sx={{ mt: 0.5 }}>
            Reset your password
          </Typography>
          <Typography sx={{ mt: 1, color: "rgba(255,255,255,0.58)" }}>
            Enter your registered email, receive a verification code, and choose a new password.
          </Typography>

          <Stack component="form" spacing={2} sx={{ mt: 3 }} onSubmit={handleResetPassword}>
            <TextField
              fullWidth
              label="Registered email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                sx: {
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            />

            <Button
              type="button"
              variant="outlined"
              disabled={requestLoading}
              onClick={handleRequestCode}
              sx={{
                borderRadius: 999,
                py: 1.2,
                color: "#fff",
                borderColor: "rgba(255,255,255,0.18)",
              }}
            >
              {requestLoading ? <CircularProgress size={20} color="inherit" /> : "Send verification code"}
            </Button>

            <TextField
              fullWidth
              label="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!codeRequested && !message}
              InputProps={{
                sx: {
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            />

            <TextField
              fullWidth
              label="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={!codeRequested && !message}
              InputProps={{
                sx: {
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            />

            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}

            <Button
              type="submit"
              fullWidth
              disabled={resetLoading}
              sx={{
                py: 1.3,
                borderRadius: 999,
                fontWeight: 800,
                background: "linear-gradient(135deg, #e50914, #ff7b54)",
              }}
            >
              {resetLoading ? <CircularProgress size={22} /> : "Set new password"}
            </Button>
          </Stack>

          <Typography align="center" sx={{ mt: 3, color: "rgba(255,255,255,0.68)" }}>
            Remembered it?{" "}
            <span
              style={{ cursor: "pointer", color: "#6366f1" }}
              onClick={() => navigate("/login")}
            >
              Back to login
            </span>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default ForgotPassword;
