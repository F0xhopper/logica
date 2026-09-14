import { MAX_SOURCE_CHARS } from "@logica/schema";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router";
import { createMap } from "../api.ts";

export function PasteScreen() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const length = text.trim().length;
  const tooLong = length > MAX_SOURCE_CHARS;
  const disabled = length === 0 || tooLong || submitting;

  async function submit() {
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const id = await createMap(text);
      navigate(`/map/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const message = tooLong
    ? `That text is too long for the MVP (${MAX_SOURCE_CHARS.toLocaleString("en")} characters max).`
    : error;

  return (
    <main className="mx-auto max-w-[720px] px-4 pt-24 pb-16">
      <h1 className="mb-8 font-sans text-[20px] leading-[1.4] font-normal text-fg">⊢ Logica</h1>

      <form onSubmit={onSubmit}>
        <textarea
          aria-label="Argument text"
          placeholder="Paste an essay, article or argument…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="block min-h-[320px] w-full resize-y rounded border border-grey-2 bg-bg p-[15px] font-serif text-[16px] leading-[1.4] text-fg placeholder:text-grey-3 focus:border-2 focus:border-fg focus:p-[14px] focus:outline-none"
        />

        <div className="mt-3 flex items-start justify-between gap-4">
          <p className="min-h-5 text-[13px] text-grey-4" role={message ? "alert" : undefined}>
            {message}
          </p>
          <button
            type="submit"
            disabled={disabled}
            className="shrink-0 rounded bg-fg px-4 py-2 text-[14px] text-bg disabled:bg-grey-2 disabled:text-grey-3"
          >
            {submitting ? "Mapping…" : "Map it"}
          </button>
        </div>
      </form>
    </main>
  );
}
