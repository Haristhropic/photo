import Image from "next/image";

export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo-lumibooth.jpg"
      alt="LumiBooth"
      width={2400}
      height={1792}
      sizes="120px"
      priority
      style={{ aspectRatio: "2400 / 1792" }}
      className={className}
    />
  );
}
