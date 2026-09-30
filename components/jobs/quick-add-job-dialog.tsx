"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { Job } from "@prisma/client";
import {
  jobCreateSchema,
  type JobCreateFormValues,
  type JobCreateInput,
} from "@/lib/validation/job";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Callback-based (onCreated), not router.refresh() — used inside the
// document/purchase-invoice builders, which manage their own
// client-side draft state. Same shape as
// components/documents/quick-add-customer-dialog.tsx.
export function QuickAddJobDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (job: Job) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<JobCreateFormValues, unknown, JobCreateInput>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: { jobRef: "", description: "" },
  });

  async function onSubmit(values: JobCreateInput) {
    setSubmitting(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't add job. Try again.");
        return;
      }

      form.reset();
      onOpenChange(false);
      onCreated(body.job as Job);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add job</DialogTitle>
          <DialogDescription>
            You can edit these details any time.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="jobRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job ref</FormLabel>
                  <FormControl>
                    <Input placeholder="TUT/0292/0926/SE" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding…" : "Add job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
