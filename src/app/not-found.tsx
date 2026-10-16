import Link from "next/link";
import { Text } from "@/i18n/Text";

export default function NotFound() {
  return <section className="panel mx-auto grid max-w-xl justify-items-start gap-5 p-6 sm:p-8">
    <p className="text-sm text-muted">404</p>
    <h1><Text message="Page not found" /></h1>
    <Link href="/" className="btn btn-primary"><Text message="Find a home" /></Link>
  </section>;
}
