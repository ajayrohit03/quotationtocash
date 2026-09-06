"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  paymentDetailsSchema,
  type PaymentDetailsInput,
} from "@/lib/validation/business";
import { toSettingsBusiness, type SettingsBusiness } from "./types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function PaymentTab({
  business,
  readOnly,
  onUpdated,
}: {
  business: SettingsBusiness;
  readOnly: boolean;
  onUpdated: (business: SettingsBusiness) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PaymentDetailsInput>({
    resolver: zodResolver(paymentDetailsSchema),
    values: {
      bankName: business.bankName ?? "",
      accountHolderName: business.accountHolderName ?? "",
      accountNumber: business.accountNumber ?? "",
      ifscCode: business.ifscCode ?? "",
      upiId: business.upiId ?? "",
    },
  });

  async function onSubmit(values: PaymentDetailsInput) {
    // Belt-and-suspenders alongside the disabled inputs and the server's
    // own requireBusinessOwner() check — see business-profile-tab.tsx.
    if (readOnly) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/business/payment-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        return;
      }
      onUpdated(toSettingsBusiness(body.business));
      toast.success("Payment details updated");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="border-b border-border pb-4">
        <div className="text-base font-semibold">Payment details</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown in the Payment details block on documents, so customers know
          where to pay — leave any field blank to leave it off entirely.
        </p>
      </div>

      <Form {...form}>
        <fieldset disabled={readOnly}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="mt-6 grid grid-cols-2 gap-4"
          >
            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bank name</FormLabel>
                  <FormControl>
                    <Input placeholder="HDFC Bank" {...field} value={field.value ?? ""} disabled={readOnly} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountHolderName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account holder name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={business.name}
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormDescription>
                    Defaults to your business name if left blank.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accountNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account number</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono"
                      placeholder="50100123456789"
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ifscCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IFSC code</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono uppercase"
                      placeholder="HDFC0001234"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormDescription>
                    11 characters — 4-letter bank code, then 0, then a
                    6-character branch code.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="upiId"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>UPI ID</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono"
                      placeholder="business@upi"
                      {...field}
                      value={field.value ?? ""}
                      disabled={readOnly}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!readOnly && (
              <Button type="submit" disabled={submitting} className="col-span-2 mt-2 w-fit">
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            )}
          </form>
        </fieldset>
      </Form>
    </div>
  );
}
