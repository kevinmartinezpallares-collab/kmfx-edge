import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function RoadmapScaffoldSection({
  title,
  role,
  description,
  bullets,
}: {
  title: string;
  role: string;
  description: string;
  bullets: string[];
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Badge variant="outline" className="w-fit">
          {role}
        </Badge>
        {bullets.map((bullet) => (
          <div
            key={bullet}
            className="rounded-lg border border-border/70 bg-background/35 p-3 text-sm text-muted-foreground"
          >
            {bullet}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

