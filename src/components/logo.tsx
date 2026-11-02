import Image from "next/image";

export function Logo({ className = "h-12 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo-stripsnap.png"
      alt="StripSnap"
      width={512}
      height={512}
      sizes="120px"
      priority
      style={{ aspectRatio: "1 / 1" }}
      className={className}
    />
  );
}
