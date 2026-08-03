import type { ReactNode } from "react";
import { Card } from "./card";

export interface StateMessageProps {
  message: string;
  action?: ReactNode;
  className?: string;
}

function StateMessage({ message, action, className, error }: StateMessageProps & { error: boolean }) {
  return (
    <Card
      className={`grid justify-items-start gap-sb-4 border-dashed p-sb-6 ${className ?? ""}`}
      role={error ? "alert" : "status"}
    >
      <p className="m-0 max-w-prose text-sm leading-relaxed text-sb-text-secondary">{message}</p>
      {action}
    </Card>
  );
}

export function EmptyState(props: StateMessageProps) {
  return <StateMessage {...props} error={false} />;
}

export function ErrorState(props: StateMessageProps) {
  return <StateMessage {...props} error />;
}
