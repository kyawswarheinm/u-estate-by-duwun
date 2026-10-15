"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser } from "../lib/session";
import { updateDb } from "../lib/store";
import { z } from "zod";
import { CURRENCIES, LOCALES } from "./index";

export async function savePreferences(form: FormData): Promise<void> {
  const parsed = z.object({ locale: z.enum(LOCALES), currency: z.enum(CURRENCIES) })
    .safeParse({ locale: form.get("locale"), currency: form.get("currency") });
  if (!parsed.success) throw new Error("Invalid preferences");
  const { locale, currency } = parsed.data;
  // Resolve the owner on the server; never accept a user id from the client.
  const me = await currentUser();
  if (me) await updateDb((db) => {
    const profile = db.profiles.find((profile) => profile.id === me.id);
    if (profile) profile.locale = locale;
  });
  const jar = await cookies();
  const options = { path: "/", sameSite: "lax" as const, httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 365 * 86400 };
  jar.set("locale", locale, options);
  jar.set("currency", currency, options);
  revalidatePath("/", "layout");
}
