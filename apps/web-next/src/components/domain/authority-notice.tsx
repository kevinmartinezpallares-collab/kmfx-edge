import { InfoIcon } from "lucide-react";

type AuthorityNoticeProps = {
  title: string;
  body: string;
};

export function AuthorityNotice({ title, body }: AuthorityNoticeProps) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/70 p-4">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
        <InfoIcon className="size-4 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
