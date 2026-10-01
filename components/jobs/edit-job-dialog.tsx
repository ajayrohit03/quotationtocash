"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { Job } from "@prisma/client";
import {
  jobUpdateSchema,
  type JobUpdateFormValues,
  type JobUpdateInput,
} from "@/lib/validation/job";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function EditJobDialog({ job }: { job: Job }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<JobUpdateFormValues, unknown, JobUpdateInput>({
    resolver: zodResolver(jobUpdateSchema),
    values: {
      jobRef: job.jobRef,
      description: job.description ?? "",
      exchangeRate: job.exchangeRate == null ? undefined : Number(job.exchangeRate),
    },
  });

  async function onSubmit(values: JobUpdateInput) {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't update job. Try again.");
        return;
      }

      toast.success("Job updated");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Edit</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit job</DialogTitle>
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
                    <Input {...field} value={field.value ?? ""} />
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
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="exchangeRate"
              render={({ field: { onChange, value, ...field } }) => (
                <FormItem>
                  <FormLabel>Default exchange rate (e.g. 84.50)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={0.0001}
                      value={value ?? ""}
                      onChange={(e) =>
                        onChange(e.target.value === "" ? null : e.target.valueAsNumber)
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Pre-fills the exchange rate on new line items for this job.
                    Can still be overridden per line.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="mt-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
