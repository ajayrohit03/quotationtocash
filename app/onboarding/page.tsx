import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAuthForPage } from "@/lib/auth/page";
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

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <OnboardingWizard initialBusiness={membership?.business ?? null} />
    </div>
  );
}
