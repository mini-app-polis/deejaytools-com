import { ClerkProvider } from "@clerk/clerk-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./pages/App";
import "./index.css";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!key) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={key}>
      <App />
    </ClerkProvider>
  </StrictMode>
);
