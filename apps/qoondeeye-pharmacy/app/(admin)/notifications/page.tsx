"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/card";

export default function NotificationsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
        <main className="space-y-6 p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                Central inbox for system alerts and reminders.
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Notification feed</CardTitle>
              <CardDescription>
                Uses `/api/notifications` to pull messages and statuses.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                List of unread and read notifications will appear here.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
  );
}

