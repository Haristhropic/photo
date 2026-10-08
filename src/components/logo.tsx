import Image from "next/image";

export function Logo({ className = "h-10 w-auto rounded-[10px]" }: { className?: string }) {
  return <Image src="/logo.png" alt="SnapVibe" width={1039} height={908} priority className={className} />;
}
