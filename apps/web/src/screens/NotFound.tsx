import { Link } from "react-router";

export function NotFound({ message = "This map doesn't exist." }: { message?: string }) {
  return (
    <main className="mx-auto max-w-[720px] px-4 pt-24">
      <p className="mb-4 text-[14px] text-fg">{message}</p>
      <Link to="/" className="rounded text-fg underline">
        ← New
      </Link>
    </main>
  );
}
