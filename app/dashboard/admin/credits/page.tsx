import { CreditGrantForm } from "./CreditGrantForm";

// Server component — admin-gating happens at the layout level
// (app/dashboard/admin/layout.tsx). Mounts the client form.
export default function AdminCreditsPage() {
  return (
    <div className="max-w-2xl">
      <h1
        className="text-2xl font-semibold tracking-tight mb-2"
        style={{ fontFamily: "'Cal Sans', system-ui, sans-serif", color: "#1C0F05" }}
      >
        Grant credits
      </h1>
      <p className="text-sm font-medium mb-6" style={{ color: "#7A6A50" }}>
        Insert an admin_adjust ledger row for a user. Positive amounts credit;
        negative amounts deduct. Every grant carries your user id and an
        optional note for audit.
      </p>
      <CreditGrantForm />
    </div>
  );
}
