"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ExpenseCategoriesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-primary/10 bg-background/80 px-4 backdrop-blur-md ">
          <div className="flex-1" />
          <Button size="sm" className="gap-1.5 rounded-full">
            <Plus className="h-4 w-4" />
            New category
          </Button>
        </header>

        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl">Expense categories</h1>
              <p className="text-sm text-muted-foreground">
                Define how expenses are grouped for reporting.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Category list</CardTitle>
              <CardDescription>
                Backed by `/api/expense-categories` modules.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Simple CRUD UI for categories will go here.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
  );
}
