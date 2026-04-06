import { useEffect, useState } from "react";
import api from "../../api/axios";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
} from "@mui/material";

function Comments() {
  const [comments, setComments] = useState([]);

  const loadComments = async () => {
    const res = await api.get("/admin/comments");
    setComments(res.data);
  };

  useEffect(() => {
    loadComments();
  }, []);

  const deleteComment = async (id) => {
    await api.delete(`/admin/comments/${id}`);
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Comments
      </Typography>

      {comments.map((c) => (
        <Card key={c.id} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body2">
              {c.content}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
            >
              Video: {c.video_id} | User: {c.user_id}
            </Typography>

            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                color="error"
                onClick={() => deleteComment(c.id)}
              >
                Delete
              </Button>
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

export default Comments;
