import { usesSupabase } from "@/lib/db/runtime";
import { translator } from "@/i18n";
import { Text } from "@/i18n/Text";
import { getPreferences } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { demoMode, requireUser } from "@/lib/session";
import { toggleMembership } from "@/app/account/actions";
import { signOut } from "@/app/auth/actions";
import { ChangePasswordForm, ProfileForm } from "@/components/AccountForms";

export const metadata = { title: "Account settings | U-Estate" };

export default async function SettingsPage() {
  const { locale } = await getPreferences();
  const [db, me] = await Promise.all([readDb(), requireUser("/account/settings")]);
  const t = translator(locale);
  const account = usesSupabase() && !me.isDemoPersona ? { email: me.email, createdAt: me.createdAt!, passwordChangedAt: undefined } : db.accounts.find((a) => a.userId === me.id);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="page-title"><Text message="Account settings" /></h1>
        <p className="mt-1 text-deep"><Text message="Your profile, sign-in details and U-topia membership." /></p>
      </header>

      <section aria-labelledby="profile-title" className="panel p-5">
        <h2 id="profile-title" className="text-xl font-bold"><Text message="Profile" /></h2>
        <div className="mt-4">
          <ProfileForm name={me.name} nationality={me.nationality} locale={me.locale ?? "en"} fixedNationality={Boolean(me.isDemoPersona)} />
        </div>
      </section>

      <section aria-labelledby="signin-title" className="panel p-5">
        <h2 id="signin-title" className="text-xl font-bold"><Text message="Sign-in details" /></h2>
        {account ? (
          <>
            <dl className="mt-3 grid gap-1 text-sm">
              <div className="flex gap-2"><dt className="text-deep"><Text message="Email:" /></dt><dd className="font-semibold">{account.email}</dd></div>
              <div className="flex gap-2"><dt className="text-deep"><Text message="Account created:" /></dt><dd>{new Date(account.createdAt).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</dd></div>
              {account.passwordChangedAt && <div className="flex gap-2"><dt className="text-deep"><Text message="Password changed:" /></dt><dd>{new Date(account.passwordChangedAt).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</dd></div>}
            </dl>
            <p className="mt-2 text-sm text-deep"><Text message="Your password is stored only as a salted hash. Nobody at U-Estate can read it." /></p>
            <h3 className="mt-5 font-bold"><Text message="Change password" /></h3>
            <div className="mt-3"><ChangePasswordForm /></div>
          </>
        ) : (
          <p className="mt-2 text-deep"><Text message="This is a demo persona: it signs in with one click and has no email or password. Create your own account to try sign-in." /></p>
        )}
      </section>

      <section id="membership" aria-labelledby="membership-title" className="panel p-5">
        <h2 id="membership-title" className="text-xl font-bold"><Text message="U-topia membership" /></h2>
        <p className="mt-2">
          <Text message="Status:" /> <strong>{me.utopiaMember ? t("Member: co-buy groups are open to you") : t("Not linked: co-buy groups are for U-topia members only")}</strong>
        </p>
        {demoMode() && !me.isDemoPersona && (
          <form action={toggleMembership} className="mt-3 grid justify-items-start gap-2">
            <button type="submit" className="btn btn-secondary">{me.utopiaMember ? t("Unlink membership (demo)") : t("Link my U-topia membership (demo)")}</button>
            <p className="hint"><Text message="Demo only. In the real product, U-topia confirms membership through its own sign-in; nobody can make themselves a member." /></p>
          </form>
        )}
        {me.isDemoPersona && <p className="hint mt-2"><Text message="Demo personas keep a fixed membership so the co-buy demo always behaves the same." /></p>}
      </section>

      <section aria-labelledby="session-title" className="panel p-5">
        <h2 id="session-title" className="text-xl font-bold"><Text message="Sign out" /></h2>
        <p className="mt-1 text-deep"><Text message="Your account and listings stay saved. Sign in again with the same email and password." /></p>
        <form action={signOut} className="mt-3">
          <button type="submit" className="btn btn-secondary"><Text message="Sign out" /></button>
        </form>
      </section>
    </div>
  );
}
