"use client";

import type { CSSProperties } from "react";
import { Compass } from "lucide-react";

/**
 * Organization avatar. Logos come straight from the synced GSoC catalog
 * (external URLs), so plain <img> is used instead of next/image, which
 * would require allow-listing every upstream host.
 */
export function OrgLogo({
  src,
  name,
  backgroundColor,
  size = 44,
}: {
  src: string | null;
  name: string;
  backgroundColor?: string | null;
  size?: number;
}) {
  const fallbackStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 13,
    display: "grid",
    placeItems: "center",
    color: "#41647c",
    fontSize: size / 2.6,
    fontWeight: 800,
    flex: "0 0 auto",
  };
  if (!src) {
    return (
      <span
        aria-hidden="true"
        style={{ ...fallbackStyle, background: "#e9f5ff", overflow: "hidden" }}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        ...fallbackStyle,
        background: backgroundColor || "#e9f5ff",
        overflow: "hidden",
        color: "#8e9ba5",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- external catalog URL */}
      <img
        alt=""
        loading="lazy"
        src={src}
        referrerPolicy="no-referrer"
        style={{ width: "76%", height: "76%", objectFit: "contain" }}
      />
    </span>
  );
}

/** Historical GSoC participation years — never a future-participation claim. */
export function ParticipationYears({ years }: { years: number[] }) {
  if (years.length === 0) return null;
  const shown = years.length > 4 ? [...years.slice(0, 4), null] : years;
  return (
    <span className="explore-years" title={`Historical GSoC participation: ${years.join(", ")}`}>
      <Compass aria-hidden="true" size={11} />
      <span>
        {shown.map((year) => (year === null ? `+${years.length - 4}` : String(year))).join(", ")}
      </span>
    </span>
  );
}

export { formatTimestamp } from "./format-timestamp";
