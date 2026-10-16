import { Text } from "@/i18n/Text";
import Image from "next/image";
import { safeNext } from "@/lib/auth-rules";
import { SignUpForm } from "@/components/AuthForms";
import { WALLET } from "@/lib/wallet";

export const metadata = { title: "Create account | U-Estate" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext, "/account?welcome=1");
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,520px)_1fr] lg:items-start">
      <section aria-labelledby="signup-title" className="panel p-6 sm:p-8">
        <Image src="/brand/u-estate-app-icon-512.png" alt="" width={48} height={48} className="mb-4 rounded-[12px]" />
        <h1 id="signup-title" className="page-title"><Text message="Create your account" /></h1>
        <p className="mb-6 mt-2 text-deep">This is a demo. Use any made-up email, such as <strong>anythings@example.com</strong>, and a new password.</p>
        <SignUpForm next={next} />
      </section>

      <aside className="grid gap-4 lg:pt-4" aria-label="What you get">
        <h2 className="section-title"><Text message="With an account you can" /></h2>
        <ul className="grid gap-3">
          <li className="panel p-4"><strong className="block"><Text message="List and sell your property" /></strong><span className="text-deep"><Text message="Publish a listing, check the deed and compare offers by rules you publish first." /></span></li>
          <li className="panel p-4"><strong className="block"><Text message="See everything you own on U-Estate" /></strong><span className="text-deep"><Text message="Your listings, offers received and co-buy groups in one place." /></span></li>
          <li className="panel p-4"><strong className="block">Get ฿{WALLET.signupGrantThb.toLocaleString("en-US")} of test money</strong><span className="text-deep"><Text message="Use it to try co-buying. No real money is ever involved." /></span></li>
        </ul>
        <p className="text-sm text-deep">Your account stays saved: sign in later with the same email and password.</p>
      </aside>
    </div>
  );
}
