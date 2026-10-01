"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  jobCreateSchema,
  type JobCreateFormValues,
  type JobCreateInput,
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

export function AddJobDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<JobCreateFormValues, unknown, JobCreateInput>({
    resolver: zodResolver(jobCreateSchema),
    defaultValues: { jobRef: "", description: "", exchangeRate: undefined },
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

      toast.success("Job added");
      setOpen(false);
      form.reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add job</DialogTrigger>
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
                        onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)
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
                {submitting ? "Adding…" : "Add job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
