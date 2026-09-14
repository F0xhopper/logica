import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { PasteScreen } from "./PasteScreen.tsx";

function setup() {
  render(
    <MemoryRouter>
      <PasteScreen />
    </MemoryRouter>,
  );
  return {
    textarea: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Argument text" }),
    button: screen.getByRole<HTMLButtonElement>("button", { name: "Map it" }),
  };
}

describe("PasteScreen", () => {
  afterEach(cleanup);

  it("disables Map it until there is text", () => {
    const { textarea, button } = setup();
    expect(button.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(button.disabled).toBe(true);
    fireEvent.change(textarea, { target: { value: "Phones are bad." } });
    expect(button.disabled).toBe(false);
  });

  it("disables Map it when the text is too long", () => {
    const { textarea, button } = setup();
    fireEvent.change(textarea, { target: { value: "x".repeat(60_001) } });
    expect(button.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/too long/);
  });
});
