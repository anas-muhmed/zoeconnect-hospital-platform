import { redirect } from "next/navigation";

// The forgot-password flow is now a modal on the /sign-in page itself
// (see forgot-password-dialog.tsx), matching the real application's own
// login page, which never had a separate forgot-password route either.
// This route is kept only so old bookmarks/links don't 404.
export default function ForgotPasswordRedirect() {
  redirect("/sign-in");
}
