import GameShell from "./_components/GameShell";

export default function HomePage() {
  return (
    <main className="flex h-dvh flex-col items-stretch overflow-y-auto overscroll-y-contain px-4 py-6">
      <header className="mb-6 shrink-0 text-center">
        <h1 className="bg-gradient-to-b from-abyss-soul via-abyss-khaos to-abyss-ember bg-clip-text text-3xl font-bold uppercase tracking-widest text-transparent">
          ABYSS
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.4em] text-abyss-mist">Khaos Descent</p>
      </header>
      <div className="mx-auto w-full max-w-md flex-1 pb-12">
        <GameShell />
      </div>
    </main>
  );
}
