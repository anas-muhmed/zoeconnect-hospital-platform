import type { Metadata } from "next";
import { SignUpForm } from "@/components/sign-up-form";
import { AuroraBackground } from "@/components/three/aurora-background";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your own ZoeConnect cloud workspace.",
};

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-32">
      <AuroraBackground />
      <SignUpForm />
    </div>
  );
}
