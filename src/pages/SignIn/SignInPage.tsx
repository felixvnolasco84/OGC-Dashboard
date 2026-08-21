import { SignIn } from "@clerk/clerk-react";
// import LOGO from '../../../public/OGC-LOGO.svg';

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
      {/* Logo */}
      {/* <div className="mb-8">
        <img src={LOGO} alt="OGC Logo" className="w-16 h-16" />
      </div> */}

      {/* Sign In Card */}
      <div className="w-full max-w-md">
        {/* <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Bienvenido
          </h1>
          <p className="text-muted-foreground">
            Inicia sesión para acceder al dashboard
          </p>
        </div> */}

        {/* Clerk Sign In Component */}
        <div className="flex justify-center">
          <SignIn
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-xl",
              }
            }}
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            afterSignInUrl="/"
          />
        </div>
      </div>

      {/* Footer */}
      {/* <div className="mt-8 text-center text-sm text-subtle-foreground">
        <p>© 2024 OGC Dashboard. Todos los derechos reservados.</p>
      </div> */}
    </div>
  );
}
