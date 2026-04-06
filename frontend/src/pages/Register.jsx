import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerUser } from "../api/auth.api";
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

function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const data = await registerUser({ email, password });

      if (data?.access_token) {
        login(data.access_token); // 🔑 auto-login
      } else {
        navigate("/login");
      }
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
        "Registration failed"
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
            JOIN THE PLATFORM
          </Typography>
          <Typography variant="h4" align="center" fontWeight="bold" sx={{ mt: 0.5 }}>
            Create Account
          </Typography>
          <Typography align="center" sx={{ mt: 1, color: "rgba(255,255,255,0.58)" }}>
            Build your watchlist, subscribe to creators, and unlock full access.
          </Typography>

          <Box component="form" onSubmit={handleRegister} sx={{ mt: 2 }}>
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
              {loading ? <CircularProgress size={22} /> : "Register"}
            </Button>
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
