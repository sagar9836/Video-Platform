import * as React from "react";
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Button,
  Chip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);
  const navigate = useNavigate();

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "rgba(15,15,15,0.94)",
        backdropFilter: "blur(14px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "none",
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: 68 }}>
        <Box
          onClick={() => navigate("/")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            cursor: "pointer",
          }}
        >
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: "12px",
              display: "grid",
              placeItems: "center",
              background: "#ff0000",
              color: "#fff",
              fontWeight: 800,
              boxShadow: "0 8px 18px rgba(255,0,0,0.28)",
            }}
          >
            ▶
          </Box>

          <Box>
            <Typography sx={{ fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              VideoPlatform
            </Typography>
            <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              Home
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1 }}>
          <Chip
            label="Home"
            onClick={() => navigate("/")}
            sx={{
              bgcolor: "rgba(255,255,255,0.05)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 999,
            }}
          />
          {user && (
            <Chip
              label={user.role === "CREATOR" ? "Studio" : "You"}
              onClick={() => navigate(user.role === "CREATOR" ? "/creator" : "/dashboard")}
              sx={{
                bgcolor: "rgba(255,255,255,0.05)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 999,
              }}
            />
          )}
        </Box>

        {!user && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              onClick={() => navigate("/login")}
              sx={{ color: "#fff", borderRadius: 999, px: 2 }}
            >
              Login
            </Button>
            <Button
              variant="contained"
              onClick={() => navigate("/register")}
              sx={{
                borderRadius: 999,
                px: 2.5,
                color: "#fff",
                background: "#ff0000",
              }}
            >
              Register
            </Button>
          </Box>
        )}

        {user && (
          <IconButton
            onClick={handleMenuOpen}
            sx={{
              p: 0.4,
              border: "1px solid rgba(255,255,255,0.12)",
              bgcolor: "rgba(255,255,255,0.04)",
            }}
          >
            <Avatar
              sx={{
                bgcolor: "#2c1b1b",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              {user.email?.[0]?.toUpperCase()}
            </Avatar>
          </IconButton>
        )}

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl) && Boolean(user)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: {
              bgcolor: "#151214",
              color: "white",
              minWidth: 200,
              borderRadius: 2,
              border: "1px solid rgba(255,255,255,0.08)",
              mt: 1,
            },
          }}
        >
          {user && (
            <MenuItem disabled>
              {user.email?.split("@")[0]}
              {user.role && ` (${user.role})`}
            </MenuItem>
          )}

          {/* ================= CREATOR (SAME LOGIC AS YOUR CODE) ================= */}
          {user?.role === "CREATOR" && (
            user.creator ? (
              <MenuItem
                onClick={() => {
                  handleMenuClose();
                  // ✅ public channel uses CREATOR ID
                  // navigate(`/channel/${user.creator.id}`);
                  navigate("/creator");
                }}
              >
                Creator Studio
              </MenuItem>
            ) : (
              <MenuItem
                onClick={() => {
                  handleMenuClose();
                  navigate("/creator/channel/create");
                }}
              >
                Create Channel
              </MenuItem>
            )
          )}

          {/* ================= USER ================= */}
          {user?.role === "USER" && (
            <MenuItem
              onClick={() => {
                handleMenuClose();
                // ✅ correct route
                navigate("/creator/apply");
              }}
            >
              Become a Creator
            </MenuItem>
          )}

          {/* ================= ADMIN ================= */}
          {user?.role === "ADMIN" && (
            <MenuItem
              onClick={() => {
                handleMenuClose();
                navigate("/admin");
              }}
            >
              Admin Panel
            </MenuItem>
          )}

          {/* ================= LOGOUT ================= */}
          {user && (
            <MenuItem
              onClick={() => {
                handleMenuClose();
                logout();
              }}
            >
              Logout
            </MenuItem>
          )}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
