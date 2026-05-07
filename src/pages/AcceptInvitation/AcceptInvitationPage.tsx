import { SignUp } from "@clerk/clerk-react";
import LOGO from "../../../public/OGC-LOGO.svg";

function getSafeRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const redirectUrl = params.get("redirect_url") || "/";

  if (!redirectUrl.startsWith("/") || redirectUrl.startsWith("//")) {
    return "/";
  }

  return redirectUrl;
}

export default function AcceptInvitationPage() {
  const redirectUrl = getSafeRedirectUrl();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col items-center justify-center p-4">
      <div className="mb-8">
        <img src={LOGO} alt="OGC Logo" className="w-16 h-16" />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Activar Cuenta
          </h1>
          <p className="text-gray-600">
            Completa tu acceso para entrar al dashboard.
          </p>
        </div>

        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-xl",
              },
            }}
            routing="path"
            path="/accept-invitation"
            signInUrl="/sign-in"
            forceRedirectUrl={redirectUrl}
            fallbackRedirectUrl={redirectUrl}
            signInForceRedirectUrl={redirectUrl}
            signInFallbackRedirectUrl={redirectUrl}
          />
        </div>
      </div>
    </div>
  );
}
