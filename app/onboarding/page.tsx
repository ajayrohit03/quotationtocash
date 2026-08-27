import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAuthForPage } from "@/lib/auth/page";
import { listPendingInvitationsForEmail } from "@/lib/invitations/service";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage() {
  const { user } = await requireAuthForPage();

  const membership = await prisma.businessMember.findFirst({
    where: { userId: user.id },
    include: { business: true },
    orderBy: { createdAt: "asc" },
  });

  // Onboarding is skippable at every step after the business is created,
  // so "done" means the wizard was explicitly finished (or skipped to the
  // end), not merely "a business exists" — a user who abandoned mid-wizard
  // should resume where they left off, not get bounced to the dashboard.
  if (membership?.business.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  // NoBusinessError -> /onboarding (lib/auth/page.ts) is the one
  // chokepoint every brand-new user passes through no matter how they
  // arrived — direct sign-up, OAuth, whatever. That makes this the right
  // single place to check for a pending invitation before ever rendering
  // the "create your own business" wizard: someone who signed up cold
  // with an invited email should be offered their invitation, not
  // accidentally create an unwanted second business. See
  // docs/invitation-onboarding-design.md §4.4. Only checked when there's
  // no membership yet at all — someone mid-wizard for their own business
  // has already made that choice and shouldn't be redirected away from it.
  if (!membership) {
    const pending = await listPendingInvitationsForEmail(user.email);
    if (pending.length > 0) {
      redirect("/invitations");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <OnboardingWizard initialBusiness={membership?.business ?? null} />
    </div>
  );
}
