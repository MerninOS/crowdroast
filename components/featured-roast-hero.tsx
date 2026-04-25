import Link from "next/link";
import type { Lot } from "@/lib/types";

interface FeaturedRoastHeroProps {
  lot: Lot & { campaign_deadline?: string | null } | null;
  campaignId?: string | null;
}

function formatDeadline(deadline: string | null | undefined): string {
  if (!deadline) return "No deadline";
  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs <= 0) return "Ended";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function FeaturedRoastHero({ lot, campaignId }: FeaturedRoastHeroProps) {
  if (!lot) return null;

  const commitPct =
    lot.total_quantity_kg > 0
      ? Math.round((lot.committed_quantity_kg / lot.total_quantity_kg) * 100)
      : 0;

  const altitudeLabel =
    lot.altitude_min && lot.altitude_max
      ? `${lot.altitude_min}–${lot.altitude_max}m`
      : lot.altitude_min
        ? `${lot.altitude_min}m`
        : null;

  return (
    <section
      style={{
        background: "#5A7A3A",
        borderBottom: "3px solid #1C0F05",
        padding: "44px 24px 52px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative leaf motif */}
      <svg
        viewBox="0 0 120 120"
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 120,
          height: 120,
          opacity: 0.08,
          pointerEvents: "none",
        }}
      >
        <ellipse cx="60" cy="60" rx="24" ry="50" fill="#FDFAF0" transform="rotate(-30 60 60)" />
        <line x1="60" y1="15" x2="60" y2="105" stroke="#FDFAF0" strokeWidth="2" />
      </svg>

      <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative" }}>
        {/* Label row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <span
            style={{
              background: "#E8913A",
              color: "#1C0F05",
              fontFamily: "'Cal Sans', system-ui, sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "5px 12px",
              border: "2px solid #1C0F05",
              borderRadius: 4,
              boxShadow: "2px 2px 0 #1C0F05",
            }}
          >
            Featured Roast
          </span>
          <span
            style={{
              fontFamily: "'Cal Sans', system-ui, sans-serif",
              fontSize: 11,
              color: "#FDFAF0",
              opacity: 0.75,
              letterSpacing: "0.04em",
            }}
          >
            Hand-picked by your hub
          </span>
        </div>

        {/* Two-column layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 1fr",
            gap: 28,
            alignItems: "stretch",
          }}
        >
          {/* Left — story card */}
          <div
            style={{
              background: "#FDFAF0",
              color: "#1C0F05",
              border: "3px solid #1C0F05",
              borderRadius: 12,
              padding: "28px 32px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: 16,
              boxShadow: "5px 5px 0 #1C0F05",
            }}
          >
            {/* Cup score badge — the one place Adore Cats lives */}
            <div
              style={{
                position: "absolute",
                top: -18,
                right: -18,
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: "#F5C842",
                color: "#1C0F05",
                border: "3px solid #1C0F05",
                boxShadow: "4px 4px 0 #1C0F05",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                transform: "rotate(8deg)",
                zIndex: 1,
              }}
            >
              {lot.score ? (
                <>
                  <span
                    style={{
                      fontFamily: "'Adore Cats', 'Fredoka', cursive",
                      fontSize: 32,
                      lineHeight: 1,
                    }}
                  >
                    {lot.score}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Cal Sans', system-ui, sans-serif",
                      fontSize: 8,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      marginTop: 2,
                    }}
                  >
                    cup score
                  </span>
                </>
              ) : null}
            </div>

            {/* Hub info line */}
            {lot.origin_country && (
              <div
                style={{
                  fontFamily: "'Cal Sans', system-ui, sans-serif",
                  fontSize: 11,
                  color: "#7A6A50",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {lot.region ? `${lot.region} · ` : ""}{lot.origin_country}
              </div>
            )}

            {/* Headline — Cal Sans, lowercase, heavy */}
            <div>
              <h2
                style={{
                  fontFamily: "'Cal Sans', system-ui, sans-serif",
                  fontSize: "clamp(36px, 5vw, 60px)",
                  fontWeight: 900,
                  lineHeight: 1.05,
                  margin: 0,
                  color: "#1C0F05",
                  letterSpacing: "-0.02em",
                  textTransform: "lowercase",
                }}
              >
                {lot.origin_country?.toLowerCase()}
                {lot.region && (
                  <>
                    <br />
                    <span style={{ color: "#5A7A3A" }}>
                      {lot.region.toLowerCase()}.
                    </span>
                  </>
                )}
              </h2>
              {lot.farm && (
                <div
                  style={{
                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                    fontSize: 16,
                    fontWeight: 500,
                    fontStyle: "italic",
                    marginTop: 6,
                    color: "#7A6A50",
                  }}
                >
                  {lot.farm}
                </div>
              )}
            </div>

            {lot.title && (
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: "#7A6A50",
                  maxWidth: 480,
                }}
              >
                {lot.title}
              </p>
            )}

            {/* Spec grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                borderTop: "1.5px dashed #1C0F05",
                paddingTop: 14,
                marginTop: 4,
              }}
            >
              {[
                { l: "Variety", v: lot.variety || "—" },
                { l: "Process", v: lot.process || "—", sub: altitudeLabel ?? undefined },
                { l: "Crop Year", v: lot.crop_year || "—" },
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    paddingRight: 12,
                    borderLeft: i > 0 ? "1.5px dashed #1C0F05" : "none",
                    paddingLeft: i > 0 ? 14 : 0,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Cal Sans', system-ui, sans-serif",
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#7A6A50",
                      marginBottom: 4,
                    }}
                  >
                    {s.l}
                  </div>
                  <div
                    style={{
                      fontFamily: "'Cal Sans', system-ui, sans-serif",
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.1,
                    }}
                  >
                    {s.v}
                  </div>
                  {s.sub && (
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{s.sub}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right — notes + progress + CTA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Flavor notes */}
            {lot.flavor_notes && lot.flavor_notes.length > 0 && (
              <div
                style={{
                  background: "#FDFAF0",
                  color: "#1C0F05",
                  border: "3px solid #1C0F05",
                  borderRadius: 12,
                  padding: "20px 22px",
                  boxShadow: "5px 5px 0 #1C0F05",
                }}
              >
                <div
                  style={{
                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#7A6A50",
                    marginBottom: 12,
                  }}
                >
                  On the cup
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {lot.flavor_notes.map((note) => (
                    <span
                      key={note}
                      style={{
                        padding: "5px 11px",
                        border: "1.5px dashed #1C0F05",
                        borderRadius: 4,
                        background: "transparent",
                        fontFamily: "'Cal Sans', system-ui, sans-serif",
                        fontWeight: 600,
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Progress + deadline + CTA */}
            <div
              style={{
                background: "#FDFAF0",
                color: "#1C0F05",
                border: "3px solid #1C0F05",
                borderRadius: 12,
                padding: "20px 22px",
                boxShadow: "5px 5px 0 #1C0F05",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                flex: 1,
              }}
            >
              {/* Progress bar */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Cal Sans', system-ui, sans-serif",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#7A6A50",
                    }}
                  >
                    Pack progress
                  </span>
                  <span
                    style={{
                      fontFamily: "'Cal Sans', system-ui, sans-serif",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    {commitPct}%
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    background: "#D8D0B8",
                    border: "2px solid #1C0F05",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(commitPct, 100)}%`,
                      height: "100%",
                      background: "#5A7A3A",
                      borderRadius: 999,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                    fontSize: 11,
                    color: "#7A6A50",
                  }}
                >
                  {lot.committed_quantity_kg.toFixed(0)} kg committed of {lot.total_quantity_kg.toFixed(0)} kg
                </div>
              </div>

              {/* Deadline */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 12px",
                  background: "#F5F0D8",
                  border: "2px solid #1C0F05",
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#7A6A50",
                  }}
                >
                  Closes
                </span>
                <span
                  style={{
                    fontFamily: "'Cal Sans', system-ui, sans-serif",
                    fontWeight: 800,
                    fontSize: 14,
                    color: "#1C0F05",
                    marginLeft: "auto",
                  }}
                >
                  {formatDeadline(lot.campaign_deadline)}
                </span>
              </div>

              {/* CTA */}
              <Link
                href={`/dashboard/buyer/lot/${lot.id}`}
                style={{
                  display: "block",
                  background: "#E8442A",
                  color: "#F5F0D8",
                  border: "3px solid #1C0F05",
                  borderRadius: 999,
                  padding: "12px 24px",
                  fontFamily: "'Cal Sans', system-ui, sans-serif",
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  textAlign: "center",
                  boxShadow: "3px 3px 0 #1C0F05",
                  textDecoration: "none",
                  transition: "transform 0.1s, box-shadow 0.1s",
                }}
              >
                View &amp; Commit →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
