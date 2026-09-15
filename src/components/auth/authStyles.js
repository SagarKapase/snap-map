/** The text-input look shared by the account forms. */
export const inputClass = (invalid) =>
  `vz-t h-11 w-full rounded-lg border bg-vz-bg px-3.5 text-[14px] text-vz-text placeholder:text-vz-dim focus:border-vz-accent/60 ${
    invalid ? "border-vz-red/50" : "border-vz-line"
  }`;
