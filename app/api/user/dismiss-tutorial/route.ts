import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { errorResponse } from "@/lib/api/respond";
import { requireAuth } from "@/lib/auth/session";

const bodySchema = z.object({ key: z.string().min(1) });

// Idempotent — dismissing an already-dismissed key is a no-op, not an
// error, since the UI calls this the moment a banner is dismissed with
// no client-side check for whether that already happened.
export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const { key } = bodySchema.parse(await request.json());

    if (!user.dismissedTutorials.includes(key)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { dismissedTutorials: { push: key } },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
