/** Codice a 4 cifre: si conserva solo in forma cifrata, non in chiaro. Serve contro i tocchi involontari, non è una sicurezza vera. */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`foodplanner-duo:${pin}`);
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 5381;
  for (const c of data) h = ((h << 5) + h + c) >>> 0;
  return `x${h.toString(16)}`;
}
