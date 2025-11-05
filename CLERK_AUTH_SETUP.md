# Clerk Authentication Setup Guide

This guide explains how to complete the Clerk authentication setup for the OGC Dashboard.

## Overview

The application now uses **Clerk** for authentication and **Convex** for role-based access control. Users can only access the "desarrollos" (projects) they've been granted permission to.

## Architecture

- **Authentication**: Clerk handles user sign-in/sign-up
- **Authorization**: Convex database stores user roles and project permissions
- **Roles**:
  - `admin`: Full access to all projects + user management
  - `user`: Access only to assigned projects
  - `viewer`: Read-only access to assigned projects

## Setup Steps

### 1. Create a Clerk Account

1. Go to [https://clerk.com/sign-up](https://clerk.com/sign-up)
2. Create a new account
3. Create a new application

### 2. Configure Clerk JWT Template

1. In the Clerk Dashboard, go to **JWT Templates**
2. Click **New template**
3. Select **Convex** from the list
4. **IMPORTANT**: The template name MUST be `convex` (do not rename it)
5. Copy the **Issuer URL** (it will look like `https://verb-noun-00.clerk.accounts.dev`)

### 3. Set Environment Variables

#### For Convex Backend:

Run this command to set the Clerk issuer domain:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://your-clerk-issuer.clerk.accounts.dev"
```

Replace with your actual Issuer URL from step 2.

#### For Frontend (.env file):

Create or update your `.env` file with:

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_CONVEX_URL=https://your-convex-url.convex.cloud
```

Get your **Publishable Key** from Clerk Dashboard → API Keys → Quick Copy

### 4. Deploy Configuration

Deploy your Convex configuration:

```bash
npx convex dev
```

This will sync the `auth.config.ts` file to your Convex backend.

### 5. Create Your First Admin User

1. Start your application: `npm run dev`
2. Sign up with your email
3. The user will be created with default `viewer` role and no project access

4. **Manually promote to admin** via Convex Dashboard:
   - Go to your Convex Dashboard → Data → `users` table
   - Find your user record
   - Edit the `role` field to `"admin"`
   - Save

### 6. Access User Management

Once you're an admin, you can access the User Management page to:
- Assign roles to users
- Grant access to specific projects
- Manage permissions

## File Structure

### Backend (Convex)

- `convex/auth.config.ts` - Clerk JWT validation configuration
- `convex/schema.ts` - Updated with `users` table
- `convex/users.ts` - User management mutations and queries
- `convex/permissions.ts` - Permission helper functions
- `convex/desarrollos.ts` - Updated to filter projects by user access

### Frontend

- `src/main.tsx` - Configured with ClerkProvider and ConvexProviderWithClerk
- `src/components/Auth/AuthButton.tsx` - Sign in/sign up/user button
- `src/components/Auth/StoreUserEffect.tsx` - Auto-stores users in database
- `src/pages/UserManagement/UserManagementPage.tsx` - Admin interface for managing users

## Usage

### Adding Authentication to Components

```tsx
import { useConvexAuth } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";

function MyComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  
  return (
    <>
      <Authenticated>
        {/* Content for logged-in users */}
      </Authenticated>
      
      <Unauthenticated>
        {/* Content for guests */}
      </Unauthenticated>
    </>
  );
}
```

### Checking Permissions in Queries

```typescript
import { checkDesarrolloAccess } from "./permissions";

export const myQuery = query({
  args: { desarrolloId: v.id("desarrollos") },
  handler: async (ctx, args) => {
    // Check if user has access
    const hasAccess = await checkDesarrolloAccess(ctx, args.desarrolloId);
    if (!hasAccess) {
      throw new Error("No tienes acceso a este proyecto");
    }
    
    // Continue with query...
  },
});
```

## Default Behavior

- **New users**: Created with `viewer` role and no project access
- **Unauthenticated access**: Currently allowed for backward compatibility during migration
- **Admins**: Automatically have access to all projects

## Security Notes

1. Never commit `.env` files to git
2. Keep your Clerk Secret Key secure
3. Rotate API keys if compromised
4. Regularly audit user permissions

## Troubleshooting

### "Not authenticated" errors
- Ensure VITE_CLERK_PUBLISHABLE_KEY is set
- Check that user is signed in
- Verify Clerk and Convex are properly configured

### "User not found in database"
- Make sure StoreUserEffect is rendered in your app
- Check that the storeUser mutation ran successfully

### Permission issues
- Verify user has correct role in `users` table
- Check that `allowed_desarrollos` array includes the project ID
- Admins should have access to everything

## Next Steps

1. Add the User Management page to your navigation
2. Remove backward compatibility (unauthenticated access) once all users are migrated
3. Add more granular permissions (e.g., read-only vs edit access)
4. Implement audit logging for permission changes
