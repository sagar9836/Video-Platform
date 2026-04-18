import * as React from "react";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";

import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import SubscriptionsRoundedIcon from "@mui/icons-material/SubscriptionsRounded";
import VideoLibraryRoundedIcon from "@mui/icons-material/VideoLibraryRounded";
import LiveTvRoundedIcon from "@mui/icons-material/LiveTvRounded";

import { useAuth } from "../../auth/AuthContext";
import { getSubscribedChannels } from "../../api/subscription.api";
import { fetchMyNotifications } from "../../api/user.api";

function normalizeNotifications(data) {
  if (!data?.notifications) return [];
  return data.notifications;
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [accountAnchorEl, setAccountAnchorEl] = React.useState(null);
  const [notificationAnchorEl, setNotificationAnchorEl] = React.useState(null);
  const [subscriptionsAnchorEl, setSubscriptionsAnchorEl] = React.useState(null);
  const [subscriptions, setSubscriptions] = React.useState([]);
  const [notifications, setNotifications] = React.useState([]);

  const liveSubscriptions = React.useMemo(
    () => subscriptions.filter((item) => item.is_live),
    [subscriptions]
  );

  React.useEffect(() => {
    if (!user) {
      setSubscriptions([]);
      setNotifications([]);
      return undefined;
    }

    let mounted = true;

    const loadSignals = async () => {
      try {
        const [subscriptionData, notificationData] = await Promise.all([
          getSubscribedChannels().catch(() => []),
          fetchMyNotifications().catch(() => ({ notifications: [] })),
        ]);

        if (!mounted) return;

        setSubscriptions(Array.isArray(subscriptionData) ? subscriptionData : []);
        setNotifications(normalizeNotifications(notificationData));
      } catch {
        if (!mounted) return;
        setSubscriptions([]);
        setNotifications([]);
      }
    };

    loadSignals();
    const timer = window.setInterval(loadSignals, 20000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [user]);

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const closeMenus = () => {
    setAccountAnchorEl(null);
    setNotificationAnchorEl(null);
    setSubscriptionsAnchorEl(null);
  };

  const primaryActions = user
    ? [
        {
          key: "home",
          label: "Home",
          onClick: () => navigate("/"),
          icon: <HomeRoundedIcon fontSize="small" />,
          active: location.pathname === "/",
        },
        {
          key: "subscriptions",
          label: "Subscriptions",
          onClick: () => navigate("/following"),
          icon: <SubscriptionsRoundedIcon fontSize="small" />,
          active: location.pathname.startsWith("/following"),
        },
        {
          key: "studio",
          label: user.role === "CREATOR" ? "Studio" : user.role === "ADMIN" ? "Admin" : "Account",
          onClick: () =>
            navigate(
              user.role === "CREATOR"
                ? "/creator"
                : user.role === "ADMIN"
                ? "/admin"
                : "/dashboard"
            ),
          icon: <VideoLibraryRoundedIcon fontSize="small" />,
          active:
            (user.role === "CREATOR" && location.pathname.startsWith("/creator")) ||
            (user.role === "ADMIN" && location.pathname.startsWith("/admin")) ||
            (user.role === "USER" && location.pathname.startsWith("/dashboard")),
        },
      ]
    : [];

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: "rgba(10,10,12,0.82)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "none",
      }}
    >
      <Toolbar
        sx={{
          gap: { xs: 1, md: 2 },
          minHeight: 74,
          px: { xs: 1.5, md: 3 },
        }}
      >
        <Tooltip title="Go back">
          <IconButton
            onClick={handleGoBack}
            sx={{
              bgcolor: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          >
            <ArrowBackRoundedIcon />
          </IconButton>
        </Tooltip>

        <Box
          onClick={() => navigate("/")}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: "14px",
              display: "grid",
              placeItems: "center",
              background: "linear-gradient(135deg, #ff0033, #ff844f)",
              color: "#fff",
              fontWeight: 900,
              boxShadow: "0 12px 30px rgba(255, 0, 51, 0.28)",
            }}
          >
            ▶
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>
              VideoPlatform
            </Typography>
            <Typography
              sx={{
                fontSize: 12,
                color: "rgba(255,255,255,0.55)",
                whiteSpace: "nowrap",
              }}
            >
              Stream, upload, subscribe
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {user && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}
          >
            {primaryActions.map((action) => (
              <Button
                key={action.key}
                startIcon={action.icon}
                onClick={action.onClick}
                sx={{
                  borderRadius: 999,
                  px: 2,
                  color: "#fff",
                  bgcolor: action.active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        )}

        {!user && (
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => navigate("/")}
              sx={{
                color: "#fff",
                borderRadius: 999,
                px: 2,
                bgcolor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              Home
            </Button>
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
                background: "linear-gradient(135deg, #ff0033, #ff844f)",
              }}
            >
              Register
            </Button>
          </Stack>
        )}

        {user && (
          <>
            <Tooltip title="Subscribed channels">
              <IconButton
                onClick={(event) => setSubscriptionsAnchorEl(event.currentTarget)}
                sx={{
                  color: "#fff",
                  bgcolor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Badge
                  badgeContent={liveSubscriptions.length}
                  color="error"
                  invisible={liveSubscriptions.length === 0}
                >
                  <SubscriptionsRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <Tooltip title="Notifications">
              <IconButton
                onClick={(event) => setNotificationAnchorEl(event.currentTarget)}
                sx={{
                  color: "#fff",
                  bgcolor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Badge
                  badgeContent={notifications.length}
                  color="error"
                  invisible={notifications.length === 0}
                >
                  <NotificationsRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {!user.is_email_verified && (
              <Chip
                label="Verify email"
                sx={{
                  display: { xs: "none", md: "inline-flex" },
                  bgcolor: "rgba(255, 195, 113, 0.16)",
                  color: "#ffe4bc",
                  border: "1px solid rgba(255, 195, 113, 0.22)",
                }}
              />
            )}

            <IconButton
              onClick={(event) => setAccountAnchorEl(event.currentTarget)}
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
          </>
        )}

        <Menu
          anchorEl={subscriptionsAnchorEl}
          open={Boolean(subscriptionsAnchorEl)}
          onClose={() => setSubscriptionsAnchorEl(null)}
          PaperProps={{
            sx: {
              bgcolor: "#121114",
              color: "#fff",
              minWidth: 320,
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.08)",
              mt: 1,
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography fontWeight={800}>Subscribed channels</Typography>
            <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>
              Jump back into the channels you follow.
            </Typography>
          </Box>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
          {subscriptions.length === 0 ? (
            <MenuItem disabled>No subscribed channels yet</MenuItem>
          ) : (
            <List dense disablePadding sx={{ py: 0.5 }}>
              {subscriptions.slice(0, 5).map((channel) => (
                <ListItemButton
                  key={channel.creator_id}
                  onClick={() => {
                    closeMenus();
                    navigate(channel.channel_url || `/channel/${channel.creator_id}`);
                  }}
                  sx={{ px: 2, py: 1.2 }}
                >
                  <ListItemText
                    primary={channel.channel_name}
                    secondary={
                      channel.is_live
                        ? "Live now. Join straight from your subscriptions."
                        : channel.description || "Latest uploads from this channel."
                    }
                    primaryTypographyProps={{ fontWeight: 700, color: "#fff" }}
                    secondaryTypographyProps={{ color: "rgba(255,255,255,0.55)" }}
                  />
                  {channel.is_live && (
                    <Button
                      size="small"
                      startIcon={<LiveTvRoundedIcon />}
                      onClick={(event) => {
                        event.stopPropagation();
                        closeMenus();
                        navigate(channel.live_url || `/live/${channel.creator_id}`);
                      }}
                      sx={{
                        ml: 1,
                        borderRadius: 999,
                        color: "#fff",
                        bgcolor: "rgba(255, 0, 51, 0.18)",
                      }}
                    >
                      Join
                    </Button>
                  )}
                </ListItemButton>
              ))}
            </List>
          )}
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
          <MenuItem
            onClick={() => {
              closeMenus();
              navigate("/following");
            }}
          >
            Open full subscriptions
          </MenuItem>
        </Menu>

        <Menu
          anchorEl={notificationAnchorEl}
          open={Boolean(notificationAnchorEl)}
          onClose={() => setNotificationAnchorEl(null)}
          PaperProps={{
            sx: {
              bgcolor: "#121114",
              color: "#fff",
              minWidth: 340,
              borderRadius: 3,
              border: "1px solid rgba(255,255,255,0.08)",
              mt: 1,
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography fontWeight={800}>Live notifications</Typography>
            <Typography sx={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>
              New uploads, live starts, and creator updates.
            </Typography>
          </Box>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)" }} />
          {notifications.length === 0 ? (
            <MenuItem disabled>No notifications yet</MenuItem>
          ) : (
            notifications.slice(0, 6).map((notification, index) => (
              <MenuItem
                key={`${notification.created_at || "notification"}-${index}`}
                onClick={() => {
                  closeMenus();
                  if (notification.join_url) {
                    navigate(notification.join_url);
                  } else if (notification.creator_id) {
                    navigate(`/channel/${notification.creator_id}`);
                  }
                }}
                sx={{
                  display: "block",
                  py: 1.5,
                }}
              >
                <Stack spacing={0.5}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={700}>
                      {notification.title || notification.channel_name || "Platform update"}
                    </Typography>
                    {notification.type === "live-started" && (
                      <Chip
                        size="small"
                        label="Live"
                        sx={{ bgcolor: "rgba(255, 0, 51, 0.16)", color: "#fff" }}
                      />
                    )}
                  </Stack>
                  <Typography sx={{ color: "rgba(255,255,255,0.66)", whiteSpace: "normal" }}>
                    {notification.message}
                  </Typography>
                </Stack>
              </MenuItem>
            ))
          )}
        </Menu>

        <Menu
          anchorEl={accountAnchorEl}
          open={Boolean(accountAnchorEl)}
          onClose={() => setAccountAnchorEl(null)}
          PaperProps={{
            sx: {
              bgcolor: "#151214",
              color: "white",
              minWidth: 220,
              borderRadius: 3,
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
          <MenuItem
            onClick={() => {
              closeMenus();
              navigate("/following");
            }}
          >
            Subscribed channels
          </MenuItem>
          {user?.role === "CREATOR" && (
            <MenuItem
              onClick={() => {
                closeMenus();
                navigate("/creator");
              }}
            >
              Creator Studio
            </MenuItem>
          )}
          {user?.role === "USER" && (
            <MenuItem
              onClick={() => {
                closeMenus();
                navigate("/creator/apply");
              }}
            >
              Become a Creator
            </MenuItem>
          )}
          {user?.role === "ADMIN" && (
            <MenuItem
              onClick={() => {
                closeMenus();
                navigate("/admin");
              }}
            >
              Admin Panel
            </MenuItem>
          )}
          <MenuItem
            onClick={() => {
              closeMenus();
              logout();
            }}
          >
            Logout
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
