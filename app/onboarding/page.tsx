import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAuthForPage } from "@/lib/auth/page";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const { user } = await requireAuthForPage();

  const existingMembership = await prisma.businessMember.findFirst({
    where: { userId: user.id },
  });
  if (existingMembership) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Step 1 of 1
      </span>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        Set up your business
      </h1>
      <p className="mt-2 text-muted-foreground">
        Tell us a bit about your business to get started. Everything here
        stays editable later in Settings.
      </p>
      <OnboardingForm className="mt-8" />
    </div>
  );
}
