import { Button } from '@/components/ui/button'

function App() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <section className="mx-auto flex min-h-svh w-full max-w-5xl flex-col justify-center px-6 py-12">
        <div className="max-w-2xl space-y-6">
          <div className="inline-flex rounded-md border px-3 py-1 text-sm text-muted-foreground">
            React + Vite + shadcn/ui
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
              Cipher Portal
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              A clean Vite starter wired for shadcn/ui components, Tailwind CSS,
              and TypeScript path aliases.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button>Start building</Button>
            <Button variant="outline">View components</Button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
