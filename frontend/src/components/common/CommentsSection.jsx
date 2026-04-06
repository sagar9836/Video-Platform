import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Avatar,
  Button,
  TextField,
  Stack,
  Divider,
} from "@mui/material";

import { addComment, fetchComments } from "../../api/video.api";
import { useAuth } from "../../auth/AuthContext";

function CommentsSection({ videoId }) {
  const { user } = useAuth(); // logged-in user (null if guest)

  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  /* =========================
     LOAD COMMENTS
     ========================= */
  useEffect(() => {
    if (!videoId) return;
    loadComments();
  }, [videoId]);

  const loadComments = async () => {
    try {
      const data = await fetchComments(videoId);
      setComments(data);
    } catch {
      console.error("Failed to load comments");
    }
  };

  /* =========================
     ADD COMMENT
     ========================= */
  const handleAddComment = async () => {
    if (!content.trim()) return;

    try {
      setLoading(true);
      await addComment({ video_id: videoId, content });
      setContent("");
      await loadComments(); // refresh list
    } catch {
      alert("Failed to add comment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ mt: 4 }}>
      {/* ================= HEADER ================= */}
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Comments ({comments.length})
      </Typography>

      {/* ================= ADD COMMENT ================= */}
      {user ? (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Avatar>
              {user.email?.[0]?.toUpperCase()}
            </Avatar>

            <Box sx={{ flex: 1 }}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                placeholder="Add a comment..."
                variant="standard"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />

              <Stack
                direction="row"
                spacing={1}
                justifyContent="flex-end"
                sx={{ mt: 1 }}
              >
                <Button
                  size="small"
                  onClick={() => setContent("")}
                >
                  Cancel
                </Button>

                <Button
                  size="small"
                  variant="contained"
                  disabled={!content.trim() || loading}
                  onClick={handleAddComment}
                >
                  Comment
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sign in to add a comment.
        </Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* ================= COMMENT LIST ================= */}
      <Stack spacing={3}>
        {comments.map((c) => (
          <Stack
            key={c.id}
            direction="row"
            spacing={2}
            alignItems="flex-start"
          >
            <Avatar>
              {String(c.user_id)[0]}
            </Avatar>

            <Box>
              <Typography variant="subtitle2">
                User #{c.user_id}
              </Typography>

              <Typography variant="caption" color="text.secondary">
                {new Date(c.created_at).toLocaleString()}
              </Typography>

              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {c.content}
              </Typography>
            </Box>
          </Stack>
        ))}

        {comments.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No comments yet. Be the first to comment!
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

export default CommentsSection;
