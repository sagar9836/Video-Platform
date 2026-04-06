import { Outlet, useNavigate } from "react-router-dom";
import { Box, Button, Stack } from "@mui/material";

export default function CreatorLayout() {
  const navigate = useNavigate();

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto", p: 2 }}>
      {/* Top Creator Nav */}
      <Stack direction="row" spacing={2} mb={3}>
        <Button onClick={() => navigate("/creator")}>
          Studio
        </Button>

        <Button
          variant="contained"
          onClick={() => navigate("/creator/upload")}
        >
          Upload Video
        </Button>
      </Stack>

      {/* 🔥 Child pages render here */}
      <Outlet />
    </Box>
  );
}
