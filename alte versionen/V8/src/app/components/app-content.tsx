import React, { useState } from "react";
import { useAuth } from "./auth-context";
import { LoginScreen } from "./login-screen";
import { RegisterScreen } from "./register-screen";
import { HouseholdSetup } from "./household-setup";
import { MainShell } from "./main-shell";
import { Loader2 } from "lucide-react";

export function AppContent() {
  // DEV MODE: Skip auth and household checks, go straight to main shell.
  // Re-enable the full auth flow when ready to test login/registration.
  return <MainShell />;
}