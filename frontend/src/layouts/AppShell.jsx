import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";

import Navbar from "../components/layout/Navbar";

export default function AppShell() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(229, 9, 20, 0.08), transparent 24%), radial-gradient(circle at 85% 12%, rgba(245, 185, 90, 0.1), transparent 18%), linear-gradient(180deg, #0d0a0c 0%, #100d10 45%, #09090b 100%)",
      }}
    >
      <Navbar />
      <Outlet />
    </Box>
  );
}
