import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AuthError, ForbiddenError, NoBusinessError } from "@/lib/auth/errors";

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

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
