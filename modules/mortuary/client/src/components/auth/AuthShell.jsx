import { useLocation, useNavigate } from "react-router-dom";
import { getUploadUrl } from "../../config.js";
import { useMortuaryName } from "../../context/MortuaryNameContext.jsx";

export default function AuthShell({ children, hospitalName, hospitalLogo, portalLabel, onToggle, isLogin, noBranding, hideToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const routeIsSignIn = location.pathname === "/" || location.pathname === "/signin";

  // auth.jsx passes onToggle + isLogin to switch between its internal
  // sign-in/register forms without a route change. Login.jsx (the
  // standalone page with a separate /signup route) passes neither, so it
  // falls back to the old route-based behavior. isLogin can legitimately
  // be false, so check for undefined rather than truthiness.
  const isControlled = onToggle !== undefined && isLogin !== undefined;
  const isSignIn = isControlled ? isLogin : routeIsSignIn;
  const goSignIn = () => (isControlled ? onToggle(true)  : navigate("/"));
  const goSignUp = () => (isControlled ? onToggle(false) : navigate("/signup"));

  // auth.jsx (the login/register combo page) doesn't pass hospitalName/
  // hospitalLogo props - it updates the shared context instead, so the
  // preview logo can update live while typing without re-rendering this
  // whole shell via props. Login.jsx (the standalone login page) still
  // passes props directly. Props win when given; context is the fallback -
  // except when noBranding is set (e.g. SuperAdmin login, which has no
  // hospital of its own and shouldn't show whatever was last looked up
  // elsewhere via the shared context).
  const { mortuaryName, mortuaryLogo } = useMortuaryName();

  const displayName = noBranding ? null : (hospitalName || mortuaryName || null);

  // hospitalLogo coming from backend may be either:
  // - an uploads path like "/uploads/logo.png"
  // - or a full URL like "http://localhost:3001/uploads/logo.png"
  // No local default anymore - if there's no real hospital logo yet, nothing renders.
  const displayLogo = noBranding ? null : (() => {
    const src = hospitalLogo || mortuaryLogo;
    if (!src || typeof src !== "string") return null;
    const trimmed = src.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith("/")) return getUploadUrl(trimmed);
    // If backend returns something unexpected (e.g. "uploads/..."), still try to resolve.
    return getUploadUrl(`/${trimmed}`);
  })();


  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex min-h-[520px]">

        {/* ── Left panel ── */}
        <div
          className="hidden md:flex flex-col justify-between w-5/12 p-10 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 60%, #818cf8 100%)" }}
        >
          {/* circle decorations */}
          <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full bg-white/10" />
          <div className="absolute top-24 -right-20 w-72 h-72 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 left-10 w-56 h-56 rounded-full bg-white/10" />

          {/* Faint full-panel logo wash - sits behind everything, purely atmospheric */}
          {displayLogo && (
            <img
              src={displayLogo}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500"
              style={{ opacity: 0.12 }}
            />
          )}

          {/* Authorized badge */}
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-white/80 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              {portalLabel ? `Authorized ${portalLabel}` : "Authorized Portal"}
            </span>
          </div>

          {/* Logo — wrapped in a card, no placeholder when there's no logo yet */}
          <div className="relative z-10 flex flex-col items-center justify-center flex-1 py-6">
            {displayLogo && (
              <div className="w-full max-w-[280px] aspect-square rounded-3xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/30 transition-all duration-500">
                <img
                  src={displayLogo}
                  alt="Hospital Logo"
                  className="w-[80%] h-[80%] object-contain drop-shadow-xl transition-opacity duration-500"
                />
              </div>
            )}
          </div>

          {/* Bottom: hospital name */}
          {displayName && (
            <div className="relative z-10">
              <div className="h-px w-12 mb-5 bg-white/35" />
              <h2 className="text-white text-2xl font-bold leading-snug">
                {displayName}
              </h2>
              <p className="text-white/60 text-sm mt-2">
                Securely manage mortuary records and operations.
              </p>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col justify-center px-8 py-10 md:px-12 overflow-y-auto">

          {/* Sign in / Sign up toggle - not every page has both modes (e.g. SuperAdmin login) */}
          {!hideToggle && (
            <div className="flex justify-center mb-8">
              <div className="bg-gray-100 rounded-full p-1 flex gap-1">
                <button
                  onClick={goSignIn}
                  className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                    isSignIn
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Sign in
                </button>
                <button
                  onClick={goSignUp}
                  className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                    !isSignIn
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Sign up
                </button>
              </div>
            </div>
          )}

          {/* Page content */}
          {children}
        </div>
      </div>
    </div>
  );
}