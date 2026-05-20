"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EventPayloadPanel } from "./event-payload-panel";
import type { ConsolidationRunDetailSelected } from "./types";
import { fmtDateTime, truncId } from "./utils";

export function RunEventsCard({
  events,
}: {
  events: ConsolidationRunDetailSelected["events"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Events</CardTitle>
        <CardDescription>
          {events.length} audit event
          {events.length === 1 ? "" : "s"} on this run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No events recorded for this run.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Time</TableHead>
                <TableHead className="w-[140px]">Event</TableHead>
                <TableHead className="w-[120px]">Actor</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id} className="align-top">
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDateTime(event.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {event.eventType}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="font-mono text-xs"
                    title={event.actorUserId ?? undefined}
                  >
                    {event.actorUserId
                      ? truncId(event.actorUserId, 6, 4)
                      : "system"}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    {event.payload &&
                    typeof event.payload === "object" &&
                    !Array.isArray(event.payload) ? (
                      <EventPayloadPanel
                        payload={event.payload as Record<string, unknown>}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
