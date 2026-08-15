import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        InvoiceFlow
      </span>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance">
        Professional quotations and invoices, built for Indian GST
      </h1>
      <p className="max-w-md text-muted-foreground">
        Create a polished quotation or invoice in about two minutes.
      </p>
      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/sign-up" />}>
          Get started
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/sign-in" />}
        >
          Sign in
        </Button>
      </div>
    </div>
  );
}
