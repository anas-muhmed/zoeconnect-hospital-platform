import type { Metadata } from "next";
import { SignInForm } from "@/components/sign-in-form";
import { AuroraBackground } from "@/components/three/aurora-background";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your ZoeConnect enterprise workspace.",
};

export default function SignInPage() {
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-32">
      <AuroraBackground />
      <SignInForm />
    </div>
  );
}
