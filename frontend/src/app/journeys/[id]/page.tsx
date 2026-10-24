"use client";

import { useParams } from "next/navigation";
import { JourneyWorkspace } from "@/components/questline/explore/journey-workspace";

export default function JourneyPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) {
    return (
      <div className="feature-page explore-page">
        <p className="explore-rec-error">Journey not found.</p>
      </div>
    );
  }
  return <JourneyWorkspace journeyId={id} />;
}
