import { Suspense } from "react";
import ReviewModule from "@/modules/review/ReviewModule";

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="card" style={{ padding: "20px", textAlign: "center" }}>Loading Review Workspace...</div>}>
      <ReviewModule />
    </Suspense>
  );
}
