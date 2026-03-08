import React from "react";
import { AppContent } from "./components/app-content";

export default function App() {
  // DEV MODE: AuthProvider removed temporarily. Re-wrap with <AuthProvider> when re-enabling auth.
  return <AppContent />;
}