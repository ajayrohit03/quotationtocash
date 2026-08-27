import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { AuthError, ForbiddenError, NoBusinessError } from "@/lib/auth/errors";
import {
  requireAuth,
  requireBusiness,
  requireBusinessAdmin,
  requireBusinessOwner,
  type BusinessContext,
} from "@/lib/auth/session";

// Page/layout variants of the lib/auth/session.ts checks: instead of
// throwing for a route handler to turn into a status code, these redirect
// straight to the right place. This is the resource-based auth pattern
// Clerk now recommends over middleware route matching (see proxy.ts).

export async function requireAuthForPage(): Promise<{ user: User }> {
  try {
    return await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in");
    }
    throw error;
  }
}

export async function requireBusinessForPage(): Promise<BusinessContext> {
  try {
    return await requireBusiness();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in");
    }
    if (error instanceof NoBusinessError) {
      redirect("/onboarding");
    }
    throw error;
  }
}

export async function requireBusinessOwnerForPage(): Promise<BusinessContext> {
  try {
    return await requireBusinessOwner();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in");
    }
    if (error instanceof NoBusinessError) {
      redirect("/onboarding");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }
}

export async function requireBusinessAdminForPage(): Promise<BusinessContext> {
  try {
    return await requireBusinessAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/sign-in");
    }
    if (error instanceof NoBusinessError) {
      redirect("/onboarding");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    throw error;
  }
}
