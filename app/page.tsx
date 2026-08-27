import Link from "next/link";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        QuotationToCash
      </span>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance">
        Professional quotations and invoices, built for Indian GST
      </h1>
      <p className="max-w-md text-muted-foreground">
        Create a polished quotation or invoice in about two minutes.
      </p>
      <Show when="signed-out">
        <div className="flex gap-3">
          <SignUpButton>
            <Button>Get started</Button>
          </SignUpButton>
          <SignInButton>
            <Button variant="outline">Sign in</Button>
          </SignInButton>
        </div>
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-3">
          <Button nativeButton={false} render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
          <UserButton />
        </div>
      </Show>
    </div>
  );
}
