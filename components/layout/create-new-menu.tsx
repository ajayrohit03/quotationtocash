"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CreateNewMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button className="w-full justify-center gap-1.5 shadow-sm" />
        }
      >
        <Plus className="size-4" />
        Create new
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem render={<Link href="/quotations/new" />}>
          New quotation
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/invoices/new" />}>
          New invoice
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
