# Role-Based Access Control (RBAC)

## Overview
The application implements role-based access control with three user roles:
- **admin**: Full access to all features and pages
- **user**: Access to project-specific pages
- **viewer**: Read-only access to projects

## Role Hierarchy
```
admin (level 3) > user (level 2) > viewer (level 1)
```

## Protected Routes

### Admin-Only Routes (Require "admin" role)
- `/transacciones` - Global transactions table
- `/proveedores` - Global suppliers table with project filter
- `/documentos` - Global documents with project filter
- `/admin` - Admin page for weekly totals upload
- `/usuarios` - User management page

### Project-Specific Routes (All authenticated users)
- `/proyecto/:proyectoId/presupuesto` - Budget page
- `/proyecto/:proyectoId/control` - Control page
- `/proyecto/:proyectoId/programa` - Work schedule
- `/proyecto/:proyectoId/documentos` - Project documents
- `/proyecto/:proyectoId/transacciones` - Project transactions
- `/proyecto/:proyectoId/proveedores` - Project suppliers
- `/proyecto/:proyectoId/partidas/:id` - Budget item details

### Public Routes (No authentication required)
- `/proyectos` - Projects list (home)
- `/legal` - Legal page
- `/aviso-de-privacidad` - Privacy notice

## Implementation

### ProtectedRoute Component
Location: `/src/components/Auth/ProtectedRoute.tsx`

Wraps components that require specific roles:
```tsx
<ProtectedRoute requiredRole="admin">
  <AdminPage />
</ProtectedRoute>
```

Features:
- Shows loading state while checking authentication
- Redirects unauthenticated users to `/proyectos`
- Shows "Access Denied" page for users without required role
- Respects role hierarchy (admin can access user/viewer pages)

### Sidebar Protection
Location: `/src/components/ui/Sidebar.tsx`

Bottom menu items (admin features) are:
- Hidden for non-authenticated users
- Hidden for non-admin users
- Shows message "Menú de administrador no disponible" for authenticated non-admins

## User Roles in Database

Default role for new users: `viewer`

To change a user's role, use the User Management page (`/usuarios`) or update in Convex dashboard:
```typescript
// In convex/users.ts
role: "admin" | "user" | "viewer"
```

## Access Control Logic

```typescript
function hasRequiredRole(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = {
    admin: 3,
    user: 2,
    viewer: 1,
  };
  
  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole];
  
  return userLevel >= requiredLevel;
}
```

## Testing Access Control

1. **Test as Admin**: Should see all menu items and access all pages
2. **Test as User**: Should see projects but not admin menu items
3. **Test as Viewer**: Should see projects but not admin menu items
4. **Test Unauthenticated**: Should redirect to login or show limited access

## Security Notes

- Authentication is handled by Clerk
- Authorization is checked both in:
  - Frontend (ProtectedRoute component)
  - Backend (Convex queries/mutations with `ctx.auth`)
- Always verify user permissions in backend mutations
- Frontend protection is for UX; backend is the security boundary
