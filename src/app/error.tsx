"use client";
import Link from "next/link";
import { Text } from "@/i18n/Text";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="panel mx-auto grid max-w-xl gap-5 p-6 sm:p-8" role="alert">
    <h1><Text message="Something went wrong." /></h1>
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn btn-primary" onClick={() => retry()}><Text message="Try again" /></button>
      <Link href="/" className="btn btn-secondary"><Text message="Find a home" /></Link>
    </div>
  </section>;
}
