/**
 * Shown while the app starts (checking the login). It is part of the first HTML the server sends, so a
 * visitor that does not run JavaScript (a link checker, an AI assistant, a crawler) reads what NEXA AI is
 * instead of only "Loading...". The longer text is visually hidden for people but stays readable for them.
 */
export default function Splash() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold text-white">NEXA AI</h1>
      <p className="max-w-sm text-sm text-white/60">Describe an app or website, get working code and a live preview.</p>
      <p role="status" className="text-xs text-white/40">
        Loading...
      </p>
      <section className="sr-only" aria-label="About NEXA AI">
        <h2>What NEXA AI does</h2>
        <p>
          NEXA AI is an AI website and app builder. You describe what you want in a chat, and it writes the React code and
          shows a live preview next to it. You then keep talking to change colours, text, layout and features.
        </p>
        <ul>
          <li>Chat builder with a live preview and desktop, tablet and phone sizes.</li>
          <li>Code editor (Monaco) to edit the generated files by hand.</li>
          <li>Design styles, and a different look for every new website, with scroll animations and 3D effects.</li>
          <li>Contact and booking forms, saved data and visitor login for the generated sites.</li>
          <li>Accounts, saved projects, version history with undo and redo.</li>
          <li>Publish a site to a public link, or download the whole project as a .zip.</li>
        </ul>
        <p>Sign in or create an account to start building. The builder needs JavaScript enabled in the browser.</p>
      </section>
      <noscript>
        <p className="text-sm text-white/70">NEXA AI needs JavaScript to run. Please turn it on in your browser.</p>
      </noscript>
    </main>
  );
}
