import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import LOGO from "../../../public/OGC-LOGO.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type InvitationStatus = "complete" | "sign_in" | "sign_up" | null;
type ClerkFlow = "sign_in" | "sign_up";

const INVALID_TICKET_MESSAGE =
  "Este enlace de invitación ya expiró, ya fue usado o fue generado con otra instancia de Clerk. Genera una invitación nueva e intenta de nuevo.";

function getUrlParams() {
  const params = new URLSearchParams(window.location.search);

  if (window.location.hash.includes("?")) {
    const hashQuery = window.location.hash.slice(window.location.hash.indexOf("?") + 1);
    const hashParams = new URLSearchParams(hashQuery);
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}

function getSafeRedirectUrl() {
  const params = getUrlParams();
  const redirectUrl = params.get("redirect_url") || "/";

  if (!redirectUrl.startsWith("/") || redirectUrl.startsWith("//")) {
    return "/";
  }

  return redirectUrl;
}

function getTicket() {
  return getUrlParams().get("__clerk_ticket");
}

function getInvitationStatus(): InvitationStatus {
  const status = getUrlParams().get("__clerk_status");

  if (status === "complete" || status === "sign_in" || status === "sign_up") {
    return status;
  }

  return null;
}

export default function AcceptInvitationPage() {
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp();
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn();

  const redirectUrl = useMemo(() => getSafeRedirectUrl(), []);
  const ticket = useMemo(() => getTicket(), []);
  const invitationStatus = useMemo(() => getInvitationStatus(), []);
  const startedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "needs_details" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completeSession = useCallback(async (
    createdSessionId: string | null,
    setActive: typeof setActiveSignUp
  ) => {
    if (!createdSessionId || !setActive) {
      setStatus("needs_details");
      return;
    }

    await setActive({ session: createdSessionId });
    window.location.assign(redirectUrl);
  }, [redirectUrl]);

  useEffect(() => {
    if (!ticket) {
      setStatus("error");
      setErrorMessage("No encontramos el ticket de invitación en el enlace.");
      return;
    }

    if (!signUpLoaded || !signInLoaded || startedRef.current) {
      return;
    }

    startedRef.current = true;

    if (invitationStatus === "complete") {
      window.location.assign(redirectUrl);
      return;
    }

    const runSignUp = async () => {
      const signUpAttempt = await signUp.create({
        strategy: "ticket",
        ticket,
      });

      if (signUpAttempt.status === "complete") {
        await completeSession(signUpAttempt.createdSessionId, setActiveSignUp);
        return;
      }

      setMissingFields(signUpAttempt.missingFields || []);
      setFirstName(signUpAttempt.firstName || "");
      setLastName(signUpAttempt.lastName || "");
      setStatus("needs_details");
    };

    const runSignIn = async () => {
      const signInAttempt = await signIn.create({
        strategy: "ticket",
        ticket,
      });

      if (signInAttempt.status === "complete") {
        await completeSession(signInAttempt.createdSessionId, setActiveSignIn);
        return;
      }

      setStatus("error");
      setErrorMessage("La invitación requiere pasos adicionales de inicio de sesión.");
    };

    const acceptInvitation = async () => {
      const preferredFlows: ClerkFlow[] =
        invitationStatus === "sign_in" ? ["sign_in", "sign_up"] : ["sign_up", "sign_in"];
      const errors: unknown[] = [];

      for (const flow of preferredFlows) {
        try {
          if (flow === "sign_in") {
            await runSignIn();
          } else {
            await runSignUp();
          }
          return;
        } catch (error) {
          errors.push(error);
        }
      }

      console.error("Invitation acceptance errors:", errors);
      setStatus("error");
      setErrorMessage(INVALID_TICKET_MESSAGE);
    };

    void acceptInvitation();
  }, [
    ticket,
    invitationStatus,
    signUpLoaded,
    signInLoaded,
    signUp,
    signIn,
    setActiveSignUp,
    setActiveSignIn,
    redirectUrl,
    completeSession,
  ]);

  const requiresFirstName = missingFields.includes("first_name") || missingFields.includes("firstName");
  const requiresLastName = missingFields.includes("last_name") || missingFields.includes("lastName");
  const requiresPassword = missingFields.includes("password");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!signUpLoaded) return;

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const signUpAttempt = await signUp.update({
        firstName: requiresFirstName ? firstName : undefined,
        lastName: requiresLastName ? lastName : undefined,
        password: requiresPassword ? password : undefined,
        legalAccepted: true,
      });

      if (signUpAttempt.status === "complete") {
        await completeSession(signUpAttempt.createdSessionId, setActiveSignUp);
        return;
      }

      setMissingFields(signUpAttempt.missingFields || []);
      setErrorMessage("Faltan datos para completar la cuenta.");
    } catch (error) {
      console.error("Error completing invitation:", error);
      setErrorMessage("No se pudo completar la cuenta. Revisa los datos e intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
      <div className="mb-8">
        <img src={LOGO} alt="OGC Logo" className="w-16 h-16" />
      </div>

      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Activar Cuenta
          </h1>
          <p className="text-muted-foreground">
            Completa tu acceso para entrar al dashboard.
          </p>
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mb-4 h-8 w-8 animate-spin" />
            <p>Validando invitación...</p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {status === "needs_details" && (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {requiresFirstName && (
              <div className="space-y-2">
                <Label htmlFor="firstName">Nombre</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                />
              </div>
            )}

            {requiresLastName && (
              <div className="space-y-2">
                <Label htmlFor="lastName">Apellido</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                />
              </div>
            )}

            {requiresPassword && (
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}

            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Activar Cuenta
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
