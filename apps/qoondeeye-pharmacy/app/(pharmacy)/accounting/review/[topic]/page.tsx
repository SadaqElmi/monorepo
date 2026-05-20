import { requireServerSession } from "@/lib/auth-server";

import ReviewTopicClient from "./review-topic-client";

export default async function Page() {
  await requireServerSession();
  return <ReviewTopicClient />;
}
