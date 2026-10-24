"use client";

import { useParams } from "next/navigation";
import { RepoDetail } from "@/components/questline/explore/repo-detail";

export default function RepositoryPage() {
  const params = useParams<{ slug: string; full: string }>();
  const slug = params?.slug;
  const encodedFull = params?.full;
  const fullName = encodedFull ? decodeURIComponent(encodedFull) : undefined;
  if (!slug || !fullName || !/^[^/]+\/[^/]+$/.test(fullName)) {
    return (
      <div className="feature-page explore-page">
        <p className="explore-rec-error">That repository address could not be parsed.</p>
      </div>
    );
  }
  return <RepoDetail fullName={fullName} slug={slug} />;
}
