import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  confirmEmailVerification,
  registerUser,
  requestEmailVerification,
} from "../api/auth.api";
import { useAuth } from "../auth/AuthContext";

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

const authFieldSx = {
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.78)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#f5b95a",
  },
  "& .MuiOutlinedInput-root": {
    borderRadius: 3,
    bgcolor: "rgba(255,255,255,0.06)",
    color: "#fff",
  },
  "& .MuiOutlinedInput-input": {
    color: "#fff",
  },
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.18)",
  },
  "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(255,255,255,0.34)",
  },
  "& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "#f5b95a",
  },
  "& .MuiFormHelperText-root": {
    color: "rgba(255,255,255,0.58)",
  },
};

function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationMode, setVerificationMode] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await registerUser({ email, password });

      setVerificationMode(Boolean(data?.requires_verification));
      setSuccess(
        data?.detail || "Account created. Please verify your email to continue."
      );
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        "Registration failed"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!verificationCode.trim()) {
      setError("Verification code is required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const data = await confirmEmailVerification({
        email,
        code: verificationCode.trim(),
      });

      if (!data?.access_token) {
        throw new Error("Verification failed");
      }

      login(data.access_token);
    } catch (err) {
      setError(err?.response?.data?.detail || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await requestEmailVerification({ email });
      setSuccess(data?.detail || "Verification code sent");
    } catch (err) {
      setError(err?.response?.data?.detail || "Unable to resend verification code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 74px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        px: 2,
        background:
          "radial-gradient(circle at 20% 15%, rgba(245,185,90,0.18), transparent 18%), radial-gradient(circle at 80% 5%, rgba(229,9,20,0.22), transparent 20%), linear-gradient(180deg, #0d0a0d 0%, #151114 100%)",
      }}
    >
      <Card
        sx={{
          maxWidth: 460,
          width: "100%",
          borderRadius: 6,
          bgcolor: "rgba(19,17,20,0.9)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.4)",
          backdropFilter: "blur(18px)",
        }}
      >
        <CardContent sx={{ p: 4.5 }}>
          <Typography variant="overline" sx={{ color: "#f5b95a", letterSpacing: "0.18em" }}>
            {verificationMode ? "VERIFY YOUR EMAIL" : "JOIN THE PLATFORM"}
          </Typography>
          <Typography variant="h4" align="center" fontWeight="bold" sx={{ mt: 0.5 }}>
            {verificationMode ? "Activate Account" : "Create Account"}
          </Typography>
          <Typography align="center" sx={{ mt: 1, color: "rgba(255,255,255,0.58)" }}>
            {verificationMode
              ? `We sent a verification code to ${email}. Enter it below to finish registration.`
              : "Build your watchlist, subscribe to creators, and unlock full access."}
          </Typography>

          <Box component="form" onSubmit={verificationMode ? handleVerify : handleRegister} sx={{ mt: 2 }}>
            {!verificationMode ? (
              <>
                <TextField
                  fullWidth
                  label="Email"
                  margin="normal"
                  sx={authFieldSx}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <TextField
                  fullWidth
                  label="Password"
                  type="password"
                  margin="normal"
                  helperText="Use at least 8 characters."
                  sx={authFieldSx}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            ) : (
              <>
                <TextField
                  fullWidth
                  label="Verification code"
                  margin="normal"
                  sx={authFieldSx}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.2} sx={{ mt: 2 }}>
                  <Button
                    type="submit"
                    fullWidth
                    disabled={loading}
                    sx={{
                      py: 1.3,
                      borderRadius: 999,
                      fontWeight: 800,
                      background: "linear-gradient(135deg, #e50914, #ff7b54)",
                    }}
                  >
                    {loading ? <CircularProgress size={22} /> : "Verify and continue"}
                  </Button>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={handleResend}
                    disabled={loading}
                    sx={{
                      py: 1.3,
                      borderRadius: 999,
                      borderColor: "rgba(255,255,255,0.18)",
                      color: "#fff",
                    }}
                  >
                    Resend code
                  </Button>
                </Stack>
              </>
            )}

            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mt: 2 }}>{success}</Alert>}

            {!verificationMode && (
              <Button
                type="submit"
                fullWidth
                disabled={loading}
                sx={{
                  mt: 3,
                  py: 1.3,
                  borderRadius: 999,
                  fontWeight: 800,
                  background: "linear-gradient(135deg, #e50914, #ff7b54)",
                }}
              >
                {loading ? <CircularProgress size={22} /> : "Register"}
              </Button>
            )}
          </Box>

          <Typography align="center" sx={{ mt: 3, color: "rgba(255,255,255,0.68)" }}>
            Already have an account?{" "}
            <span
              style={{ cursor: "pointer", color: "#6366f1" }}
              onClick={() => navigate("/login")}
            >
              Login
            </span>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Register;
