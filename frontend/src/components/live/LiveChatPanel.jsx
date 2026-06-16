import { useEffect, useMemo, useRef, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { useAuth } from "../../auth/AuthContext";

const buildChatSocketUrl = (roomName, displayName) => {
  if (!roomName || typeof window === "undefined") {
    return "";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = localStorage.getItem("token");
  const url = new URL(
    `${protocol}//${window.location.host}/live/chat/${encodeURIComponent(roomName)}`
  );

  if (token) {
    url.searchParams.set("token", token);
  }
  if (displayName) {
    url.searchParams.set("display_name", displayName);
  }

  return url.toString();
};

const mergeMessages = (current, incoming) => {
  const next = [...current];
  const seen = new Set(current.map((message) => message.id));

  for (const message of incoming) {
    if (!message?.id || seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    next.push(message);
  }

  return next.slice(-100);
};

export default function LiveChatPanel({
  roomName,
  enabled = true,
  dark = false,
  title = "Live chat",
  subtitle = "Audience messages update in real time through Kafka-backed fanout.",
}) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const manuallyClosedRef = useRef(false);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(enabled ? "connecting" : "idle");
  const [error, setError] = useState("");

  const displayName = useMemo(() => {
    if (user?.creator?.channel_name) {
      return user.creator.channel_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return "Guest";
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    manuallyClosedRef.current = false;
    setMessages([]);

    if (!enabled || !roomName) {
      setStatus("idle");
      return undefined;
    }

    const connect = () => {
      const url = buildChatSocketUrl(roomName, displayName);
      if (!url) {
        return;
      }

      setStatus("connecting");
      setError("");

      const socket = new WebSocket(url);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus("connected");
        setError("");
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === "chat.history") {
            setMessages(Array.isArray(payload.messages) ? payload.messages : []);
            return;
          }
          if (payload?.type === "chat.message" && payload?.message) {
            setMessages((current) => mergeMessages(current, [payload.message]));
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      socket.onerror = () => {
        setError("Chat connection hit a network error.");
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (manuallyClosedRef.current || !enabled) {
          setStatus("idle");
          return;
        }

        setStatus("reconnecting");
      reconnectTimerRef.current = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      manuallyClosedRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [displayName, enabled, roomName]);

  const handleSend = () => {
    const socket = socketRef.current;
    const text = draft.trim();

    if (!socket || socket.readyState !== WebSocket.OPEN || !text) {
      return;
    }

    socket.send(JSON.stringify({ text }));
    setDraft("");
  };

  const isConnected = status === "connected";
  const palette = dark
    ? {
        card: "#101010",
        border: "1px solid rgba(255,255,255,0.08)",
        messageBg: "rgba(255,255,255,0.05)",
        selfBg: "rgba(215, 38, 61, 0.18)",
        text: "#fff",
        muted: "rgba(255,255,255,0.68)",
        inputBg: "rgba(255,255,255,0.04)",
      }
    : {
        card: "#fffaf4",
        border: "1px solid rgba(83, 43, 28, 0.08)",
        messageBg: "#fff",
        selfBg: "#fff0f2",
        text: "#2c1a14",
        muted: "#6b564f",
        inputBg: "#fff",
      };

  return (
    <Card
      sx={{
        borderRadius: 5,
        bgcolor: palette.card,
        color: palette.text,
        border: palette.border,
        boxShadow: "none",
        minHeight: 540,
      }}
    >
      <CardContent sx={{ p: { xs: 3, md: 3.5 }, height: "100%" }}>
        <Stack spacing={2.5} sx={{ height: "100%" }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="h5" fontWeight={800}>
                {title}
              </Typography>
              <Chip
                size="small"
                label={
                  status === "connected"
                    ? "Connected"
                    : status === "reconnecting"
                    ? "Reconnecting"
                    : status === "connecting"
                    ? "Connecting"
                    : "Idle"
                }
                sx={{
                  bgcolor: dark ? "rgba(255,255,255,0.08)" : "rgba(215, 38, 61, 0.10)",
                  color: palette.text,
                  fontWeight: 700,
                }}
              />
            </Stack>
            <Typography sx={{ mt: 0.75, color: palette.muted }}>
              {subtitle}
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <Box
            sx={{
              flex: 1,
              minHeight: 300,
              maxHeight: 340,
              overflowY: "auto",
              pr: 1,
            }}
          >
            <Stack spacing={1.2}>
              {messages.length === 0 ? (
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 3,
                    bgcolor: palette.messageBg,
                    border: palette.border,
                  }}
                >
                  <Typography sx={{ color: palette.muted }}>
                    No messages yet. Start the conversation when the room goes live.
                  </Typography>
                </Box>
              ) : (
                messages.map((message) => {
                  const isOwnMessage =
                    user && Number(message?.sender?.user_id) === Number(user.id);

                  return (
                    <Box
                      key={message.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 3,
                        bgcolor: isOwnMessage ? palette.selfBg : palette.messageBg,
                        border: palette.border,
                      }}
                    >
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                      >
                        <Typography fontWeight={800}>
                          {message?.sender?.display_name || "Viewer"}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: palette.muted }}>
                          {message?.sent_at
                            ? new Date(message.sent_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </Typography>
                      </Stack>
                      <Typography sx={{ mt: 0.75, whiteSpace: "pre-wrap" }}>
                        {message.text}
                      </Typography>
                    </Box>
                  );
                })
              )}
              <Box ref={messagesEndRef} />
            </Stack>
          </Box>

          <Stack spacing={1.25}>
            <TextField
              placeholder={
                enabled
                  ? isConnected
                    ? "Send a message"
                    : "Waiting for chat connection"
                  : "Chat becomes available when the room is active"
              }
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              multiline
              minRows={2}
              maxRows={5}
              disabled={!enabled || !isConnected}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 3,
                  bgcolor: palette.inputBg,
                  color: palette.text,
                },
                "& .MuiInputBase-input::placeholder": {
                  color: palette.muted,
                  opacity: 1,
                },
              }}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ color: palette.muted, fontSize: 13 }}>
                Posting as {displayName}
              </Typography>
              <Button
                variant="contained"
                onClick={handleSend}
                disabled={!enabled || !isConnected || !draft.trim()}
                sx={{
                  borderRadius: 999,
                  bgcolor: dark ? "#d7263d" : "#7d2230",
                  "&:hover": {
                    bgcolor: dark ? "#bd1f33" : "#691c28",
                  },
                }}
              >
                Send
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
