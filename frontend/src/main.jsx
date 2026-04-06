import "./index.css"; 
import React from "react";
import ReactDOM from "react-dom/client";
import App from "../src/app/App";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

