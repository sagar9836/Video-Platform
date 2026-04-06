import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createChannel } from "../../api/creator.api";

import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
} from "@mui/material";

export default function CreateChannel() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const navigate = useNavigate();

  const submit = async () => {
    if (!name) return alert("Channel name required");

    await createChannel({ name, description });
    alert("Channel created successfully");
    // ✅ creator dashboard auto-picks channel from AuthContext refresh
    navigate("/login");
  };

  return (
    <Box maxWidth={500} mx="auto" mt={5}>
      <Card>
        <CardContent>
          <Typography variant="h5" fontWeight="bold">
            Create Channel
          </Typography>

          <TextField
            fullWidth
            label="Channel Name"
            margin="normal"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <TextField
            fullWidth
            label="Description"
            margin="normal"
            multiline
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Button variant="contained" sx={{ mt: 2 }} onClick={submit}>
            Create Channel
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
