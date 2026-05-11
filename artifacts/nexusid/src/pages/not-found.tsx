import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="text-8xl font-black text-primary/20 mb-4">404</div>
        <h1 className="text-xl font-bold mb-2">Page not found</h1>
        <p className="text-sm text-muted-foreground mb-6">This page doesn't exist or has been moved.</p>
        <Link href="/">
          <Button size="sm">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
