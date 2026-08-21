import { SignUp } from "@clerk/clerk-react";
import LOGO from '../../../public/OGC-LOGO.svg';

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8">
        <img src={LOGO} alt="OGC Logo" className="w-16 h-16" />
      </div>

      {/* Sign Up Card */}
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Crear Cuenta
          </h1>
          <p className="text-muted-foreground">
            Regístrate para acceder al dashboard
          </p>
        </div>

        {/* Clerk Sign Up Component */}
        <div className="flex justify-center">
          <SignUp 
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-xl",
              }
            }}
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            afterSignUpUrl="/"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-subtle-foreground">
        <p>© 2024 OGC Dashboard. Todos los derechos reservados.</p>
      </div>
    </div>
  );
}
