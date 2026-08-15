import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AuthError, ForbiddenError, NoBusinessError } from "@/lib/auth/errors";

// Checked by code, not identity (`instanceof Prisma.PrismaClientKnownRequestError`)
// — see lib/auth/user-identity.ts for why that's unreliable under Turbopack.
function isUniqueConstraintViolation(
  error: unknown,
): error is { code: "P2002"; meta?: { target?: string[] } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NoBusinessError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: z.treeifyError(error) },
      { status: 400 },
    );
  }
  if (isUniqueConstraintViolation(error)) {
    const target = error.meta?.target;
    const field = Array.isArray(target) ? target.at(-1) : undefined;
    return NextResponse.json(
      {
        error: field
          ? `That ${field.replace(/_/g, " ")} is already in use.`
          : "That value is already in use.",
      },
      { status: 409 },
    );
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
