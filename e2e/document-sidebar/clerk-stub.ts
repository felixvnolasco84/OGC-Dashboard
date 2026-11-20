export const useUser = () => ({ user: { id: "fixture", fullName: "Usuario de prueba", primaryEmailAddress: { emailAddress: "prueba@example.test" } } });
export const useClerk = () => ({ signOut: async () => { throw new Error("Cerrar sesión no forma parte de esta prueba"); } });
export const useAuth = () => ({ userId: "fixture", getToken: async () => null });
export const SignInButton = () => null;
