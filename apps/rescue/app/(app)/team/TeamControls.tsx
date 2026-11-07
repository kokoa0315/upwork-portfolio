"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setNotify, setRole } from "./actions";

export function RoleSelect({ userId, name, role }: { userId: string; name: string; role: "owner" | "member" }) {
  const [value, setValue] = useOptimistic(role);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="grid justify-items-end gap-1">
      <select
        aria-label={`Role for ${name}`}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "owner" | "member";
          start(async () => {
            setValue(next);
            setError((await setRole(userId, next)).error);
          });
        }}
        className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
      >
        <option value="owner">Owner</option>
        <option value="member">Member</option>
      </select>
      {error ? (
        <p role="alert" className="text-xs text-no">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function NotifyToggle({ on }: { on: boolean }) {
  const [value, setValue] = useOptimistic(on);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            start(async () => {
              setValue(next);
              setError((await setNotify(next)).error);
            });
          }}
          className="size-6 shrink-0 accent-brand"
        />
        Email me when a new invoice is posted
      </label>
      {error ? (
        <p role="alert" className="text-xs text-no">
          {error}
        </p>
      ) : null}
    </div>
  );
}
