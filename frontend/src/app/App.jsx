import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import PublicVideoRoute from "./PublicVideoRoute";

/* PUBLIC */
import Login from "../pages/Login";
import Register from "../pages/Register";
import ForgotPassword from "../pages/ForgotPassword";

/* USER */
import Dashboard from "../pages/Dashboard";
import ApplyCreator from "../pages/ApplyCreator";

/* CREATOR */
import VideoUpload from "../pages/creator/VideoUpload";
import CreatorStudio from "../pages/creator/CreatorStudio";
import LiveControl from "../pages/creator/LiveControl";

/* CHANNEL / VIDEO */
import ChannelPage from "../pages/channel/ChannelPage";
import VideoPlayer from "../pages/video/VideoPlayer";
import LiveWatch from "../pages/live/LiveWatch";

/* ADMIN */
import AdminLayout from "../layouts/AdminLayout";
import AdminDashboard from "../pages/admin/AdminDashboard";

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />

        {/* PUBLIC */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* USER */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/creator/apply"
          element={
            <ProtectedRoute>
              <ApplyCreator />
            </ProtectedRoute>
          }
        />

        {/* CREATOR */}
        <Route
          path="/creator"
          element={
            <ProtectedRoute role="CREATOR">
              <CreatorStudio />
            </ProtectedRoute>
          }
        />

        <Route
          path="/creator/upload"
          element={
            <ProtectedRoute role="CREATOR">
              <VideoUpload />
            </ProtectedRoute>
          }
        />

        <Route
          path="/creator/live"
          element={
            <ProtectedRoute role="CREATOR">
              <LiveControl />
            </ProtectedRoute>
          }
        />

        {/* PUBLIC CHANNEL */}
        <Route
          path="/channel/:creatorId"
          element={
            isAuthenticated ? (
              <ChannelPage />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* VIDEO */}
        <Route
          path="/video/:videoId"
          element={
            <PublicVideoRoute>
              <VideoPlayer />
            </PublicVideoRoute>
          }
        />
        <Route
          path="/live/:creatorId"
          element={<LiveWatch />}
        />

        {/* ADMIN */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="ADMIN">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboard />} />
        </Route>

        {/* FALLBACK */}
        <Route
          path="*"
          element={
            isAuthenticated ? (
              <Navigate to="/" />
            ) : (
              <Navigate to="/" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
