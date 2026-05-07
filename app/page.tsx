import LandingClient from "./_components/LandingClient";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-4xl font-bold uppercase tracking-widest text-transparent">
        ABYSS
      </h1>
      <p className="mt-1 text-sm uppercase tracking-[0.4em] text-abyss-mist">Khaos Descent</p>
      <div className="mt-10 w-full max-w-md">
        <LandingClient />
      </div>
    </main>
  );
}
