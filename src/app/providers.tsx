"use client";

import { AuthProvider } from "@/lib/auth";
import { WorkoutAppProvider } from "@/context/workout-app-context";

type ProvidersProps = {
  children: React.ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      <WorkoutAppProvider>{children}</WorkoutAppProvider>
    </AuthProvider>
  );
}
