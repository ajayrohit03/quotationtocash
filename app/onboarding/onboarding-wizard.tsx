"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Business } from "@prisma/client";
import { StepBusinessDetails } from "./steps/step-business-details";
import { StepLogo } from "./steps/step-logo";
import { StepGst } from "./steps/step-gst";
import { StepTemplate } from "./steps/step-template";

type WizardState = { step: 1 } | { step: 2 | 3 | 4; business: Business };

export function OnboardingWizard({
  initialBusiness,
}: {
  initialBusiness: Business | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(
    initialBusiness ? { step: 2, business: initialBusiness } : { step: 1 },
  );

  async function finish() {
    await fetch("/api/business/complete-onboarding", { method: "POST" });
    router.push("/dashboard");
  }

  switch (state.step) {
    case 1:
      return (
        <StepBusinessDetails
          onCreated={(business) => setState({ step: 2, business })}
        />
      );
    case 2:
      return (
        <StepLogo
          business={state.business}
          onNext={(business) => setState({ step: 3, business })}
          onSkip={() => setState({ step: 3, business: state.business })}
        />
      );
    case 3:
      return (
        <StepGst
          business={state.business}
          onNext={(business) => setState({ step: 4, business })}
          onSkip={() => setState({ step: 4, business: state.business })}
        />
      );
    case 4:
      return (
        <StepTemplate
          business={state.business}
          onNext={finish}
          onSkip={finish}
        />
      );
  }
}
