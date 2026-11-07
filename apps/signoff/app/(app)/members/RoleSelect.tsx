"use client";

import { useState, useTransition } from "react";
import { setRole } from "./actions";

export function RoleSelect({ userId, role, locked, canGrantOwner }: { userId: string; role: string; locked: boolean; canGrantOwner: boolean }) {
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const options = ["owner", "admin", "approver", "member"].filter((r) => canGrantOwner || r !== "owner" || role === "owner");
  return (
    <div className="grid justify-items-end gap-1">
      <select
        aria-label="Role"
        value={value}
        disabled={locked || pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          start(async () => {
            const res = await setRole(userId, next);
            if (res.error) setValue(prev);
            setError(res.error);
          });
        }}
        className="h-8 rounded-lg border border-line bg-surface px-2 text-sm capitalize disabled:bg-canvas disabled:text-mute"
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {r[0].toUpperCase() + r.slice(1)}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-no">
          {error}
        </p>
      ) : null}
    </div>
  );
}
