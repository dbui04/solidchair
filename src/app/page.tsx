import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-neutral-100">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold mb-6">Solidchair</h1>
        <p className="text-lg mb-8">
          A simple clone of Airtable built with Next.js, tRPC, and Prisma
        </p>

        <Link
          href="/bases"
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-md text-lg"
        >
          Get Started
        </Link>
      </div>
    </main>
  );
}
