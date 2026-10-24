"use client";

import { useParams } from "next/navigation";
import { OrgProfile } from "@/components/questline/explore/org-profile";

export default function OrganizationPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  if (!slug) {
    return (
      <div className="feature-page explore-page">
        <p className="explore-rec-error">Organization not found.</p>
      </div>
    );
  }
  return <OrgProfile slug={slug} />;
}
