import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api/auth.api";
import { useAuth } from "../auth/AuthContext";

import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await loginUser({ email, password });

      if (!data?.access_token) {
        throw new Error("Invalid login response");
      }

      // 🔑 login handles token + redirect
      login(data.access_token);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        err.message ||
        "Login failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at top left, rgba(229,9,20,0.24), transparent 22%), radial-gradient(circle at top right, rgba(245,185,90,0.18), transparent 20%), linear-gradient(180deg, #0c0a0c 0%, #131012 100%)",
        px: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 460,
          width: "100%",
          borderRadius: 6,
          bgcolor: "rgba(18,16,18,0.88)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.4)",
          backdropFilter: "blur(18px)",
        }}
      >
        <CardContent sx={{ p: 4.5 }}>
          <Typography variant="overline" sx={{ color: "#f5b95a", letterSpacing: "0.18em" }}>
            STREAM ACCESS
          </Typography>
          <Typography variant="h4" align="center" fontWeight="bold" sx={{ mt: 0.5 }}>
            Welcome Back
          </Typography>
          <Typography align="center" sx={{ mt: 1, color: "rgba(255,255,255,0.58)" }}>
            Jump back into your feed, channels, and live streams.
          </Typography>

          <Box component="form" onSubmit={handleLogin} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              label="Email"
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              InputProps={{
                sx: {
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            />

            <TextField
              fullWidth
              label="Password"
              type="password"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                sx: {
                  borderRadius: 3,
                  bgcolor: "rgba(255,255,255,0.04)",
                },
              }}
            />

            <Typography
              align="right"
              sx={{
                mt: 1,
                color: "#f5b95a",
                cursor: "pointer",
                fontWeight: 700,
              }}
              onClick={() => navigate("/forgot-password")}
            >
              Forgot password?
            </Typography>

            {error && <Alert severity="error">{error}</Alert>}

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
              {loading ? <CircularProgress size={22} /> : "Login"}
            </Button>
          </Box>

          <Typography align="center" sx={{ mt: 3, color: "rgba(255,255,255,0.68)" }}>
            New here?{" "}
            <span
              style={{ cursor: "pointer", color: "#6366f1" }}
              onClick={() => navigate("/register")}
            >
              Create account
            </span>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default Login;
