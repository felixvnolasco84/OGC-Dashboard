export const useAuth = () => ({ getToken: async () => { throw new Error("Sin sesión ni backend en esta verificación."); } });
